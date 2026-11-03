// CONFIGURAÇÃO DO SUPABASE
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_KEY = 'sua-chave-anon-publica';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let usuarioAtual = null;
let todasLicencas = [];
let planoSelecionado = null;

// ========== AUTENTICAÇÃO ==========
async function fazerLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        mostrarToast('Preencha e-mail e senha', 'error');
        return;
    }
    
    const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password);
    
    if (error || !data || data.length === 0) {
        mostrarToast('E-mail ou senha inválidos', 'error');
        return;
    }
    
    usuarioAtual = data[0];
    localStorage.setItem('user', JSON.stringify(usuarioAtual));
    
    window.location.href = 'dashboard.html';
}

function fazerLogout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// ========== INICIALIZAR DASHBOARD ==========
document.addEventListener('DOMContentLoaded', async () => {
    const userJson = localStorage.getItem('user');
    if (!userJson && window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'index.html';
        return;
    }
    
    if (userJson) {
        usuarioAtual = JSON.parse(userJson);
        
        document.getElementById('userName').textContent = usuarioAtual.name;
        document.getElementById('userCredits').textContent = usuarioAtual.credits;
        document.getElementById('welcomeMessage').textContent = `Bem-vindo, ${usuarioAtual.name}!`;
        
        if (usuarioAtual.role === 'admin') {
            document.getElementById('adminPanel').style.display = 'block';
        }
        
        await carregarMinhasKeys();
    }
    
    if (document.getElementById('searchInput')) {
        document.getElementById('searchInput').addEventListener('input', () => renderizarLicencas());
        document.getElementById('statusFilter').addEventListener('change', () => renderizarLicencas());
    }
});

// ========== GERAR KEY ==========
function selecionarPlano(dias, isLifetime, nomePlano, custo) {
    planoSelecionado = { dias, isLifetime, nomePlano, custo };
    
    document.getElementById('planName').textContent = nomePlano;
    document.getElementById('planCost').textContent = `💰 ${custo} crédito(s)`;
    document.getElementById('selectedPlan').style.display = 'block';
    
    mostrarToast(`Plano ${nomePlano} selecionado - Custo: ${custo} créditos`, 'success');
}

async function gerarKeyCliente() {
    if (!planoSelecionado) {
        mostrarToast('Selecione um plano primeiro!', 'error');
        return;
    }
    
    const customerName = document.getElementById('customerName').value.trim();
    const notes = document.getElementById('notes').value;
    
    if (!customerName) {
        mostrarToast('Digite o nome do cliente!', 'error');
        return;
    }
    
    if (usuarioAtual.credits < planoSelecionado.custo) {
        mostrarToast(`Créditos insuficientes! Você tem ${usuarioAtual.credits} créditos`, 'error');
        return;
    }
    
    const { data, error } = await supabaseClient
        .rpc('gerar_key_cliente', {
            p_user_id: usuarioAtual.id,
            p_customer_name: customerName,
            p_duration_days: planoSelecionado.dias,
            p_lifetime: planoSelecionado.isLifetime,
            p_notes: notes || `Plano: ${planoSelecionado.nomePlano}`
        });
    
    if (error) {
        mostrarToast('Erro ao gerar key: ' + error.message, 'error');
        return;
    }
    
    if (data.success) {
        mostrarToast(`✅ Key gerada: ${data.key_code}\nCréditos restantes: ${data.credits_remaining}`, 'success');
        
        usuarioAtual.credits = data.credits_remaining;
        document.getElementById('userCredits').textContent = usuarioAtual.credits;
        localStorage.setItem('user', JSON.stringify(usuarioAtual));
        
        document.getElementById('customerName').value = '';
        document.getElementById('notes').value = '';
        planoSelecionado = null;
        document.getElementById('selectedPlan').style.display = 'none';
        
        await carregarMinhasKeys();
    } else {
        mostrarToast('Erro: ' + data.error, 'error');
    }
}

// ========== CARREGAR KEYS DO USUÁRIO ==========
async function carregarMinhasKeys() {
    let query = supabaseClient
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (usuarioAtual.role !== 'admin') {
        query = query.eq('user_id', usuarioAtual.id);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('Erro:', error);
        return;
    }
    
    todasLicencas = data || [];
    renderizarLicencas();
}

// ========== RENDERIZAR LICENÇAS ==========
function renderizarLicencas() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    
    let filtradas = todasLicencas.filter(l => 
        l.key_code.toLowerCase().includes(searchTerm) ||
        l.customer_name?.toLowerCase().includes(searchTerm)
    );
    
    if (statusFilter !== 'all') {
        filtradas = filtradas.filter(l => l.status === statusFilter);
    }
    
    const container = document.getElementById('licensesList');
    
    if (filtradas.length === 0) {
        container.innerHTML = '<div class="empty-state"><span>🔍</span><p>Nenhuma licença encontrada</p></div>';
        return;
    }
    
    container.innerHTML = filtradas.map(lic => `
        <div class="license-item">
            <div class="license-header">
                <span class="key-code">${lic.key_code}</span>
                <span class="status-badge status-${lic.status}">
                    ${lic.status === 'available' ? '📦 Disponível' : 
                      lic.status === 'active' ? '✅ Ativa' : 
                      lic.status === 'expired' ? '⏰ Expirada' : '🚫 Bloqueada'}
                </span>
            </div>
            <div class="license-details">
                <span class="detail">👤 ${lic.customer_name || 'N/A'}</span>
                <span class="detail">🔄 ${lic.current_activations}/${lic.max_activations} ativações</span>
                ${lic.lifetime ? 
                    '<span class="detail">♾️ Lifetime</span>' : 
                    `<span class="detail">📅 Expira: ${new Date(lic.expires_at).toLocaleDateString()}</span>`}
                ${lic.notes ? `<span class="detail">📝 ${lic.notes}</span>` : ''}
                ${lic.activated_at ? `<span class="detail">✅ Ativada em: ${new Date(lic.activated_at).toLocaleDateString()}</span>` : ''}
            </div>
            <div class="license-actions">
                <button class="btn-icon copy-btn" onclick="copiarKey('${lic.key_code}')">📋 Copiar</button>
                ${usuarioAtual.role === 'admin' ? 
                    `<button class="btn-icon delete-btn" onclick="deletarLicenca(${lic.id})">🗑️ Deletar</button>` : ''}
            </div>
        </div>
    `).join('');
}

// ========== FUNÇÕES ADMIN ==========
function abrirModalAdicionarCredito() {
    document.getElementById('adminModal').style.display = 'flex';
}

function fecharModal() {
    document.getElementById('adminModal').style.display = 'none';
}

async function adicionarCreditos() {
    const email = document.getElementById('userEmail').value;
    const credits = parseInt(document.getElementById('creditsAmount').value);
    
    if (!email || !credits) {
        mostrarToast('Preencha todos os campos', 'error');
        return;
    }
    
    const { error } = await supabaseClient
        .from('users')
        .update({ credits: supabaseClient.raw('credits + ?', credits) })
        .eq('email', email);
    
    if (error) {
        mostrarToast('Erro ao adicionar créditos', 'error');
    } else {
        mostrarToast(`✅ ${credits} créditos adicionados para ${email}`, 'success');
        fecharModal();
        document.getElementById('userEmail').value = '';
        document.getElementById('creditsAmount').value = '';
    }
}

async function verTodasKeys() {
    await carregarMinhasKeys();
    mostrarToast('Mostrando todas as keys do sistema', 'success');
}

function exportarTodasKeys() {
    const csv = todasLicencas.map(l => `${l.key_code},${l.customer_name},${l.status},${l.created_at}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `keys_${new Date().toISOString()}.csv`;
    link.click();
}

// ========== FUNÇÕES AUXILIARES ==========
async function copiarKey(key) {
    await navigator.clipboard.writeText(key);
    mostrarToast('Key copiada!', 'success');
}

async function deletarLicenca(id) {
    if (confirm('Tem certeza?')) {
        await supabaseClient.from('licenses').delete().eq('id', id);
        mostrarToast('Licença deletada!', 'success');
        await carregarMinhasKeys();
    }
}

function mostrarToast(mensagem, tipo) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = mensagem;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}