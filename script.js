const { createApp, reactive } = Vue;

// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://xulngtoekmlnxnixqkkk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1bG5ndG9la21sbnhuaXhxa2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NDI2NzgsImV4cCI6MjA5MTMxODY3OH0.PQ3Y1lJkFUihlskSeDhbqSqlcm8fKPLB4ebg9njn1-s';

// Inicializa o cliente
const sbClient = (window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

createApp({
    data() {
        return {
            session: { isLoggedIn: false, pwd: '', currentCia: '1ª CIA', dataVersion: 0 },
            ui: { menuOpen: false, currentView: 'dashboard', search: '', viewMode: 'grid', filters: { pelotao: '', plantao: '', alojamento: '' } },
            students: [],
            isImprovingText: false,
            lists: { officers: ["Cel PM Carneiro","Ten Cel PM Andreza","Ten Cel PM Thiaggo","Maj PM Juliane Santana","Cap PM Marlon","Cap PM Arantes","Cap PM Nascimento","1º Ten PM Otávio Neto","1º Ten PM Letícia","1º Ten PM Kemuel","1º Ten PM Tenório","2º Ten PM Ribeiro","2º Ten PM Paulo Lima","2º Ten PM Thaysa","2º Ten PM Pedro Lima","2º Ten PM Vasconcelos","2º Ten PM Brígida","2º Ten PM Gudemberg","2º Ten PM Melquezedeque","2º Ten PM Viviane","Outro"] },
            modals: { record: { show: false, student: null, category: 'FO' }, history: { show: false, student: null }, rewards: { show: false } },
            forms: { record: { type: 'FO+', motivo: '', data: '', oficial: '', customOficial: '', sei: '' }, report: { date: new Date().toISOString().split('T')[0], auxiliar: '', adjunto: '', data: { punishments: [], neg: [], pos: [] } } }
        }
    },
    computed: {
        uniquePelotoes() { return [...new Set(this.students.filter(s => s.cia === this.session.currentCia).map(s => s.pelotao))].sort(); },
        hasFilters() { return this.ui.filters.pelotao || this.ui.filters.plantao || this.ui.filters.alojamento || this.ui.search; },
        filteredStudents() {
            const term = this.ui.search.toLowerCase();
            let list = this.students.filter(s => s.cia === this.session.currentCia);
            if(term) list = list.filter(s => s.nome.toLowerCase().includes(term) || s.numero.toString().includes(term));
            if(this.ui.filters.pelotao) list = list.filter(s => s.pelotao === this.ui.filters.pelotao);
            if(this.ui.filters.plantao) list = list.filter(s => s.plantao === this.ui.filters.plantao);
            if(this.ui.filters.alojamento) {
                if(this.ui.filters.alojamento === 'Fem') list = list.filter(s => ['Carandiru','Apto 01','Apto 02','Apto 03'].includes(s.alojamento));
                else list = list.filter(s => s.alojamento && s.alojamento.includes(this.ui.filters.alojamento));
            }
            return list.sort((a, b) => a.numero - b.numero);
        },
        cangaList() {
            if(!this.filteredStudents.length) return [];
            const all = this.students.filter(s => s.cia === this.session.currentCia);
            const pairs = [];
            const processed = new Set();
            this.filteredStudents.forEach(s1 => {
                if(processed.has(s1.id)) return;
                const s2 = all.find(s => s.id === s1.canga_id);
                processed.add(s1.id);
                if(s2) processed.add(s2.id);
                const pair = [s1, s2].filter(x=>x).sort((a,b)=>a.numero-b.numero);
                pairs.push({ id: pair[0].id, s1: pair[0], s2: pair[1] });
            });
            return pairs.sort((a,b) => a.s1.numero - b.s1.numero);
        },
        rewardList() { return this.filteredStudents.filter(s => this.getCycleScore(s) >= 5); },
        ciaStats() {
            const list = this.students.filter(s => s.cia === this.session.currentCia);
            let foPos = 0, punishments = 0, rewards = 0;
            const enriched = list.map(s => {
                const raw = this.getRawScore(s);
                if(this.getCycleScore(s) >= 5) rewards++;
                let negCount = 0;
                if(s.history) {
                    s.history.forEach(h => {
                        if(h.type && h.type.includes('FO+')) foPos++;
                        if(h.type && ['FO-', 'Punição', 'Medida'].some(k => h.type.includes(k))) { punishments++; negCount++; }
                    });
                }
                return { ...s, raw, negCount };
            });
            return { total: list.length, foPos, punishments, rewards, topPos: enriched.filter(s => s.raw > 0).sort((a,b) => b.raw - a.raw).slice(0, 5), topNeg: enriched.filter(s => s.negCount > 0).sort((a,b) => b.negCount - a.negCount).slice(0, 5) };
        }
    },
    methods: {
        login() { if (this.session.pwd === 'admin') { this.session.isLoggedIn = true; this.loadData(); } else alert('Senha Incorreta'); },
        
        changeCia(cia) { this.session.currentCia = cia; },
        navigate(view) { this.ui.currentView = view; this.ui.menuOpen = false; },

        // --- MÉTODOS DO SUPABASE ---
        async loadData() {
            if (!sbClient) { alert('Erro de conexão com banco de dados'); return; }
            
            const { data, error } = await sbClient.from('alunos').select('*').order('numero', { ascending: true });
            
            if (error) { 
                console.error("Erro Supabase:", error); 
                alert("Erro ao carregar dados. Verifique o console."); 
                return; 
            }
            
            if (!data || data.length === 0) {
                this.resetDatabase();
            } else {
                this.students = data;
            }
            this.session.dataVersion++;
        },

        async saveData(student = null) {
            if (!sbClient) return;
            if (student) {
                await sbClient.from('alunos').update({ 
                    history: student.history, 
                    rewards_claimed: student.rewards_claimed 
                }).eq('id', student.id);
            } else {
                const { error } = await sbClient.from('alunos').upsert(this.students);
                if(error) {
                    console.error("Erro ao salvar:", error);
                    alert("Erro ao salvar no banco: " + error.message);
                }
            }
            this.session.dataVersion++;
        },

        async melhorarTextoComIA() {
            if (!sbClient) { alert("Erro: Supabase não conectado."); return; }
            const textoOriginal = this.forms.record.motivo;
            if (!textoOriginal || textoOriginal.length < 5) {
                alert("Digite um motivo mais detalhado.");
                return;
            }
            this.isImprovingText = true;
            try {
                const { data, error } = await sbClient.functions.invoke('redator-oficial', { 
                    body: { texto: textoOriginal } 
                });
                
                if (error) throw error;
                if (data && data.resultado) this.forms.record.motivo = data.resultado;
            } catch (err) {
                console.error("Erro IA:", err);
                alert("Erro na IA. Verifique se a chave GROQ_API_KEY foi adicionada nos Secrets do Supabase.");
            } finally {
                this.isImprovingText = false;
            }
        },

        // --- RESET DO BANCO ATUALIZADO (1ª CIA = ALFA..ECHO | 2ª CIA = FOX..INDIA) ---
        async resetDatabase() {
            if(!confirm('ATENÇÃO: Isso vai apagar o banco atual e recarregar a lista com a NOVA ESTRUTURA. Todos os lançamentos serão apagados. Continuar?')) return;
            
            // --- 1. DADOS DA NOVA 1ª CIA (Antiga 2ª CIA) - IDs 1 a 197 ---
            const rawCia1 = [
                { id: 1, nome: "MÁRCIO SOUZA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 2, nome: "RENATO", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 3, nome: "FERNANDO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 4, nome: "ROBERTO FREITAS", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 5, nome: "SILVANA", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 6, nome: "DANIELLE PRADO", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 7, nome: "ARCOVERDE", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 8, nome: "AUREA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 9, nome: "R. FERREIRA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 10, nome: "VICTOR FERREIRA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 11, nome: "ORLANDO", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 12, nome: "ISABELLA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 13, nome: "BRENDA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 14, nome: "AMANDA COELHO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 15, nome: "JUNIOR", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 16, nome: "THIAGO TAVARES", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 17, nome: "MURILO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 18, nome: "ARYANA", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 19, nome: "ALENCAR", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 20, nome: "LUAN PEREIRA", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 21, nome: "MANOEL", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 24, nome: "MATHEUS MESQUITA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 25, nome: "DAVI OLIVEIRA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 26, nome: "MARCOLINO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 27, nome: "FATIMA AGUIAR", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 28, nome: "LEMOS", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 29, nome: "MACIEL", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 30, nome: "M ALBUQUERQUE", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 31, nome: "ALLATAS SOUSA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 32, nome: "KAYO GABRIEL", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 33, nome: "KAROLINE ABREU", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 34, nome: "GIOVANNI", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 35, nome: "PAULINO", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 36, nome: "M. FEITOSA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 37, nome: "VALDECI", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 38, nome: "W. SILVA", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 39, nome: "ELLIO", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 40, nome: "MARINHO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 41, nome: "MALAQUIAS", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 42, nome: "CARLA ARAUJO", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 43, nome: "CINTIA SOUZA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 44, nome: "PRISCILA CORREIA", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 45, nome: "WALYSON", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 46, nome: "GRANGEIRO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 47, nome: "MACEDO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 48, nome: "ELVIS", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 49, nome: "JEFERSON SILVA", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 50, nome: "QUEIROZ", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 52, nome: "RUBSLEY", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 53, nome: "G. SILVA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 54, nome: "FRANÇA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 57, nome: "SANTANA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 58, nome: "WESLEY", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 59, nome: "RAYANNE", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 60, nome: "S.GOMES", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 61, nome: "FIRMINO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 62, nome: "LUCAS MAGALHÃES", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 63, nome: "PAULO", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 64, nome: "BONFIM", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 66, nome: "JÔNATAS SANTOS", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 67, nome: "LAYANNE", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 68, nome: "KAROLINNE MOREIRA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 69, nome: "FALCÃO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 70, nome: "MEIRA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 71, nome: "SERAFIM", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 72, nome: "NONATO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 73, nome: "PEREIRA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 74, nome: "GABRIEL", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 75, nome: "PEDRO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 76, nome: "FERREIRA", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 77, nome: "EDUARDA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 78, nome: "GISELE FERREIRA", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 79, nome: "DIÓGENES", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 80, nome: "JOSÉ", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 81, nome: "COSTA", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 82, nome: "MARCOS NASCIMENTO", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 83, nome: "P. SOUZA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 84, nome: "SIDNEI ARAÚJO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 85, nome: "ANDERSON", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 86, nome: "FERNANDO CRUZ", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 87, nome: "ARYCLAYTON", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 88, nome: "S. NETO", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 89, nome: "SILVA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 90, nome: "RAFAEL BEZERRA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 91, nome: "GESSICA", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 92, nome: "ALINE", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 93, nome: "REVERTHON", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 94, nome: "FERNANDA SOARES", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 95, nome: "BRUNO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 96, nome: "ERIVELTON", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 97, nome: "ÍTALO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 98, nome: "EMANNUEL", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 99, nome: "G. GOMES", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 100, nome: "RENAN", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 102, nome: "ALLAN MARIANO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 103, nome: "RAÍSSA SOARES", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 105, nome: "JOSÉ NETO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 106, nome: "LUCAS RANIELLE", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 107, nome: "LUCIANO", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 108, nome: "HENRIQUE", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 109, nome: "ERIKA DUARTE", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 110, nome: "CÉSAR MEDEIROS", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 111, nome: "FELIPE MORAIS", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 112, nome: "MARQUES", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 113, nome: "AURÉLIO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 114, nome: "BARBALHO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 115, nome: "VINICIUS OLIVEIRA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 116, nome: "SANTIAGO", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 118, nome: "DURVAL", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 119, nome: "VINÍCIUS SOUZA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 120, nome: "EGITO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 121, nome: "JOÃO NASCIMENTO", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 122, nome: "BATISTA", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 123, nome: "GONZAGA", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 125, nome: "MEDEIROS", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 126, nome: "GILMARA", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 127, nome: "CAIO GUIMARÃES", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 128, nome: "ALEXANDRO GOMES", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 129, nome: "LUIZ NUNES", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 130, nome: "PAULO ROBERTO", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 131, nome: "RENATA", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 132, nome: "SÉRGIO", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 133, nome: "ISRAEL", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 134, nome: "SAMEA FERRAZ", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 135, nome: "JOÃO HENRIQUE", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 136, nome: "PATRICIA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 137, nome: "RAFAEL PEREIRA", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 138, nome: "ICARO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 139, nome: "JULIANA GONDIM", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 140, nome: "VICTOR COSTA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 141, nome: "JULIANE CORDEIRO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 142, nome: "JABNER", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 143, nome: "SAMARA MELO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 144, nome: "EDJANE", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 145, nome: "HIGOR ALVES", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 146, nome: "PEREIRA MORAIS", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 147, nome: "JORGE FILHO", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 148, nome: "OLAVO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 149, nome: "CAVALCANTI", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 150, nome: "ROBERTA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 151, nome: "OLIVEIRA JÚNIOR", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 152, nome: "MOURA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 153, nome: "AFONSO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 154, nome: "DAYANE", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 156, nome: "MONALIZA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 157, nome: "VALADARES", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 158, nome: "HEYVERSON", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 161, nome: "JOSE ALISSON", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 162, nome: "JESUS", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 163, nome: "NATÁLIA", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 164, nome: "CIBELE", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 165, nome: "GUSTAVO", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 166, nome: "FELIPE FÉLIX", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 168, nome: "LEONAM", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 169, nome: "MATHEUS BARROS", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 170, nome: "ANTONIO REIS", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 171, nome: "JHONEY", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 172, nome: "FRANCISCO", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 173, nome: "IURY", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 174, nome: "LIMA PAIVA", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 175, nome: "LUIZ LEAL", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 176, nome: "RHAYSA", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 177, nome: "DIONIZIO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 178, nome: "HIAGO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 179, nome: "DÉBORA GOUVEIA", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 180, nome: "NOBREGA", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 181, nome: "THAYNARA", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 182, nome: "JOSINALDO", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 183, nome: "JULIO", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 184, nome: "ABRAAO", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 185, nome: "RONILSON", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 186, nome: "SOUTO", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 187, nome: "BELEM", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 188, nome: "MAXEMBERG", pelotao: "3º PEL/2ª CIA", history: [] },
                        { id: 189, nome: "KAMYLA", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 190, nome: "JÚLIA", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 191, nome: "SELTON", pelotao: "4º PEL/2ª CIA", history: [] },
                        { id: 192, nome: "JEFFERSON GOMES", pelotao: "1º PEL/2ª CIA", history: [] },
                        { id: 193, nome: "JAILTON", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 194, nome: "KLEVER", pelotao: "5º PEL/2ª CIA", history: [] },
                        { id: 195, nome: "PETTERSON", pelotao: "2º PEL/2ª CIA", history: [] },
                        { id: 196, nome: "CARDOSO", pelotao: "6º PEL/2ª CIA", history: [] },
                        { id: 197, nome: "ISRAEL OLIVEIRA", pelotao: "4º PEL/2ª CIA", history: [] }

            ];

            const shiftsCia1 = {
                'ALFA': [1,6,11,16,21,28,33,43,48,54,61,67,77,82,85,87,89,92,93,95,96,107,110,121,127,132,137,144,152,158,164,165,171,186,191,196,190],
                'BRAVO': [2,7,12,17,24,29,39,44,57,62,68,73,78,83,88,98,99,103,111,112,114,115,119,122,128,133,138,148,153,161,166,172,177,179,181,182],
                'CHARLIE': [3,8,13,18,25,30,34,40,45,50,58,63,69,74,79,84,90,94,105,108,120,123,129,139,143,150,156,163,154,173,184,187,183,194],
                'DELTA': [4,9,14,19,31,32,35,36,41,46,52,59,64,70,72,75,80,100,113,118,125,130,131,135,134,149,162,168,178,188,189,197],
                'ECHO': [5,10,15,20,26,27,37,38,42,47,49,53,60,66,71,76,81,86,91,97,102,109,116,126,136,141,142,146,147,151,157,170,175,180,185,195]
            };

            const cia1List = rawCia1.map(s => {
                let plantao = 'INDEFINIDO';
                for (const [p, ids] of Object.entries(shiftsCia1)) { if (ids.includes(s.id)) plantao = p; }
                
                // 👇 A MUDANÇA ESTÁ AQUI NO "pelotao: s.pelotao"
                return { id: s.id, numero: s.id, nome: s.nome, cia: '1ª CIA', pelotao: s.pelotao, plantao: plantao, history: [] };
            });

            // --- 2. DADOS DA NOVA 2ª CIA (Antiga 3ª CIA) - IDs 3001 a 3195 ---
            const rawCia2 = [
                {numero:1,nome:"HELLTON FERNANDES"},{numero:2,nome:"OLGA"},{numero:3,nome:"MIRELLY"},{numero:4,nome:"ANA SILVA"},{numero:5,nome:"GEORGE"},{numero:6,nome:"CAMPOS"},{numero:7,nome:"ALDO SILVA"},{numero:8,nome:"JEFFERSON FRANCISCO"},{numero:9,nome:"VERAS"},{numero:10,nome:"ERICK"},
                {numero:11,nome:"KALYNNE GOMES"},{numero:12,nome:"MELO"},{numero:13,nome:"JONAS"},{numero:14,nome:"WINNY"},{numero:15,nome:"TAYNÃ RAMALHO"},{numero:16,nome:"FLÁVIO CARVALHO"},{numero:17,nome:"FILIPE NÓBREGA"},{numero:18,nome:"FERNANDA BISPO"},{numero:19,nome:"THAIS FIGUEIREDO"},{numero:20,nome:"TIBURCIO"},
                {numero:21,nome:"SAMPAIO"},{numero:22,nome:"WILLIAN SANTOS"},{numero:23,nome:"RODOLFO MOURA"},{numero:24,nome:"MOYSÉS"},{numero:25,nome:"CAROLINE QUEIROZ"},{numero:26,nome:"ANDRE"},{numero:27,nome:"CLAUDIA"},{numero:28,nome:"BRANDÃO"},{numero:29,nome:"LYSIA"},{numero:30,nome:"RODRIGUES"},
                {numero:31,nome:"ROMÉRIO"},{numero:32,nome:"NAPOLEÃO"},{numero:33,nome:"LUIZ VICENTE"},{numero:34,nome:"RICARDO"},{numero:35,nome:"FILLIPE PAIXÃO"},{numero:36,nome:"MACEDO JUNIOR"},{numero:37,nome:"PABLO TORRES"},{numero:38,nome:"JOHN ALVES"},{numero:39,nome:"CAETANO"},{numero:40,nome:"ALMEIDA"},
                {numero:41,nome:"ALAN SILVA"},{numero:42,nome:"JONILDO"},{numero:43,nome:"MATHEUS ROCHA"},{numero:44,nome:"DIOGO ARAUJO"},{numero:45,nome:"GABRIELE COSTA"},{numero:46,nome:"FONTES"},{numero:47,nome:"VÍTOR RIBEIRO"},{numero:48,nome:"LIMA"},{numero:49,nome:"MIRANDA"},{numero:50,nome:"ELDER FERREIRA"},
                {numero:51,nome:"AMORIM"},{numero:52,nome:"JAMILLE"},{numero:53,nome:"PEDRO HENRIQUE"},{numero:54,nome:"ELDER CARVALHO"},{numero:55,nome:"SHIRLAYNE"},{numero:56,nome:"WESLEY BATISTA"},{numero:57,nome:"CLEYTON"},{numero:58,nome:"JOHN FELIX"},{numero:59,nome:"ASSIS"},{numero:60,nome:"JOÃO NUNES"},
                {numero:61,nome:"TEREZA"},{numero:62,nome:"IDEYVISON"},{numero:63,nome:"ALVES"},{numero:64,nome:"EDUARDO"},{numero:65,nome:"KAUHANNI"},{numero:66,nome:"LUCAS MATEUS"},{numero:67,nome:"BARBOSA"},{numero:68,nome:"AMAURI"},{numero:69,nome:"AUGUSTO"},{numero:70,nome:"LUCAS GABRIEL"},
                {numero:71,nome:"LEIMIG"},{numero:72,nome:"EDNALDO BEZERRA"},{numero:73,nome:"MILENE QUEIROZ"},{numero:74,nome:"DAVID"},{numero:75,nome:"JÚLIO CESAR"},{numero:76,nome:"ARAUJO JUNIOR"},{numero:77,nome:"FÁBIO"},{numero:78,nome:"FRANCISCO SOUZA"},{numero:79,nome:"BRUNO HENRIQUE"},{numero:80,nome:"LUIZ OLIVEIRA"},
                {numero:81,nome:"FERNANDO ROCHA"},{numero:82,nome:"LEANDRO SILVA"},{numero:83,nome:"DIEGO SANTOS"},{numero:84,nome:"EDILSON JOSE"},{numero:85,nome:"FLÁVIA COSTA"},{numero:86,nome:"HOLANDA"},{numero:87,nome:"BARRETO"},{numero:88,nome:"TACIANE"},{numero:89,nome:"EWERTON FARIAS"},{numero:90,nome:"NETTO"},
                {numero:91,nome:"DANILO"},{numero:92,nome:"MOACIR"},{numero:93,nome:"SALES"},{numero:94,nome:"ANDRÉ CARDOSO"},{numero:95,nome:"ALEX SILVA"},{numero:96,nome:"PATRÍCIA CORREIA"},{numero:97,nome:"ROBERTO CAVALCANTE"},{numero:98,nome:"JOSE MENEZES"},{numero:99,nome:"CARLOS NASCIMENTO"},{numero:100,nome:"KARLA ALBUQUERQUE"},
                {numero:101,nome:"MATHEUS ALBUQUERQUE"},{numero:102,nome:"LEITE JÚNIOR"},{numero:103,nome:"MENDONÇA"},{numero:104,nome:"FURTUNATO NETO"},{numero:105,nome:"LUCAS EDUARDO"},{numero:106,nome:"RAFAEL RIBEIRO"},{numero:107,nome:"DIEGO LOPES"},{numero:108,nome:"LISANDRY"},{numero:109,nome:"LETICIA PINHEIRO"},{numero:110,nome:"WESLEY HENRIQUE"},
                {numero:111,nome:"ANDRÉ MARINHO"},{numero:112,nome:"IVHINNY"},{numero:113,nome:"ÁUREA AMORIM"},{numero:114,nome:"JOSIANE FARIAS"},{numero:115,nome:"EDUARDO GONÇALVES"},{numero:116,nome:"BERTIPALHA"},{numero:117,nome:"GUILHERME"},{numero:118,nome:"BRUNO SILVA"},{numero:119,nome:"HEITOR"},{numero:120,nome:"ADRIANO"},
                {numero:121,nome:"LUNA"},{numero:122,nome:"ANDREY"},{numero:123,nome:"BEATRIZ"},{numero:124,nome:"CECÍLIA"},{numero:125,nome:"WILLIANE TRAJANO"},{numero:126,nome:"LUCAS RIBEIRO"},{numero:127,nome:"LOIOLA"},{numero:128,nome:"MIGUEL"},{numero:129,nome:"MARTINS"},{numero:130,nome:"IVALDO"},
                {numero:131,nome:"JOSÉ INACIO"},{numero:132,nome:"CEZAR SANTOS"},{numero:133,nome:"ANDERSON SOARES"},{numero:134,nome:"SILVÂNIO SANTOS"},{numero:135,nome:"BELTRÃO"},{numero:136,nome:"RONIÉRISON BARROS"},{numero:137,nome:"PRISCYLA NEVES"},{numero:138,nome:"JANAINA"},{numero:139,nome:"GLEYDSON"},{numero:140,nome:"RAIMUNDO"},
                {numero:141,nome:"RAMONN"},{numero:142,nome:"MAGALHÃES"},{numero:143,nome:"VIDAL"},{numero:144,nome:"SAMUEL SANTOS"},{numero:145,nome:"FRANCISCO VIEIRA"},{numero:146,nome:"ELISIO"},{numero:147,nome:"JANDERSON"},{numero:148,nome:"WANDRE"},{numero:149,nome:"FELIPE FERREIRA"},{numero:150,nome:"GERALDO"},
                {numero:151,nome:"RAINY"},{numero:152,nome:"LÉLIS"},{numero:153,nome:"HUGO"},{numero:154,nome:"TÂMARA LEMOS"},{numero:155,nome:"VICTOR ALVES"},{numero:156,nome:"SILVANO PEREIRA"},{numero:157,nome:"CARLOS LIMA"},{numero:158,nome:"FELIPE OLIVEIRA"},{numero:159,nome:"HIGOR LIMA"},{numero:160,nome:"JONAS GOMES"},
                {numero:161,nome:"FELIPE GOMES"},{numero:162,nome:"MARCONDES"},{numero:163,nome:"ELIVELTON RODRIGUES"},{numero:164,nome:"ROBSON MELO"},{numero:165,nome:"KEVIN GOMES"},{numero:166,nome:"EVANGELISTA"},{numero:167,nome:"GUSTAVO NETO"},{numero:168,nome:"MATHEUS SILVA"},{numero:169,nome:"HYGO CESÁRIO"},{numero:170,nome:"RONALDO"},
                {numero:171,nome:"MAXWEL"},{numero:172,nome:"WELTON"},{numero:173,nome:"HÉVILA"},{numero:174,nome:"ALEXANDRE"},{numero:175,nome:"EMERSON LOPES"},{numero:176,nome:"DIRLEYNNE ALVES"},{numero:177,nome:"ROSÁRIO JÚNIOR"},{numero:178,nome:"GABRIEL SILVA"},{numero:179,nome:"LEONARDO"},{numero:180,nome:"DANTAS"},
                {numero:181,nome:"PABLO MACIEL"},{numero:182,nome:"BRÚNO BATISTA"},{numero:183,nome:"LÉIA"},{numero:184,nome:"PAULO AZEVÊDO"},{numero:185,nome:"VINÍCIUS KAIRÊ"},{numero:186,nome:"SAMUEL SILVA"},{numero:187,nome:"HERMESON FILHO"},{numero:188,nome:"ALBERTO"},{numero:189,nome:"PAULO NASCIMENTO"},{numero:190,nome:"LARISSA ALCANTARA"},
                {numero:191,nome:"GOMES NASCIMENTO"},{numero:192,nome:"JOSÉ BARBOZA"},{numero:193,nome:"MARCIO LEITE"},{numero:194,nome:"VILAR"},{numero:195,nome:"JEFFERSON NUNES"}
            ].map(s => ({...s, id: 3000 + s.numero, cia: '2ª CIA', history: []}));

            // IDs mapeados do PDF plantao26.pdf
            const shiftsCia2 = {
                'FOXTROT': [3001, 3005, 3008, 3009, 3013, 3017, 3029, 3033, 3037, 3041, 3045, 3049, 3053, 3057, 3061, 3069, 3073, 3077, 3081, 3089, 3093, 3097, 3101, 3105, 3109, 3113, 3117, 3119, 3121, 3125, 3129, 3133, 3137, 3141, 3145, 3146, 3149, 3150, 3153, 3156, 3157, 3158, 3161, 3183, 3185, 3187, 3189, 3193],
                'GOLF':    [3002, 3006, 3010, 3014, 3018, 3019, 3025, 3026, 3030, 3034, 3038, 3042, 3046, 3050, 3054, 3058, 3062, 3068, 3070, 3074, 3078, 3079, 3082, 3086, 3090, 3094, 3098, 3102, 3106, 3110, 3111, 3114, 3118, 3122, 3126, 3134, 3138, 3143, 3147, 3154, 3163, 3165, 3166, 3171, 3181, 3186, 3188, 3190, 3194],
                'INDIA':   [3003, 3007, 3011, 3015, 3022, 3023, 3027, 3031, 3035, 3039, 3043, 3047, 3051, 3055, 3059, 3063, 3065, 3067, 3071, 3075, 3083, 3084, 3087, 3091, 3095, 3099, 3103, 3104, 3107, 3115, 3123, 3127, 3130, 3131, 3139, 3140, 3142, 3148, 3151, 3155, 3162, 3164, 3167, 3168, 3172, 3176, 3179, 3182, 3195],
                'HOTEL':   [3004, 3012, 3016, 3020, 3021, 3024, 3028, 3032, 3036, 3040, 3044, 3048, 3052, 3056, 3060, 3064, 3066, 3072, 3076, 3080, 3085, 3088, 3092, 3096, 3100, 3108, 3112, 3116, 3120, 3124, 3128, 3132, 3135, 3136, 3144, 3152, 3160, 3169, 3170, 3173, 3174, 3175, 3177, 3178, 3180, 3184, 3191, 3192]
            };

            const cia2List = rawCia2.map(s => {
                const realId = 3000 + s.numero;
                let plantao = 'INDEFINIDO';
                for (const [p, ids] of Object.entries(shiftsCia2)) { if (ids.includes(realId)) plantao = p; }
                return { id: realId, numero: s.numero, nome: s.nome, cia: '2ª CIA', pelotao: `${((s.numero - 1) % 6) + 1}º PEL/2ª CIA`, plantao: plantao, history: [] };
            });
            
            [...cia1List, ...cia2List].forEach(s => this.assignAttributes(s));
            this.students = [...cia1List, ...cia2List];
            this.saveData();
            this.session.dataVersion++;
        },

        assignAttributes(s) {
            const femNames = ['OLGA','MIRELLY','ANA','SILVANA','DANIELLE','AUREA','ISABELLA','BRENDA','AMANDA','ARYANA','FATIMA','KAROLINE','CINTIA','PRISCILA','LAYANNE','KAROLINNE','EDUARDA','GISELE','GESSICA','ALINE','FERNANDA','RAISSA','ERIKA','GILMARA','RENATA','SAMEA','PATRICIA','JULIANA','JULIANE','SAMARA','EDJANE','ROBERTA','MONALIZA','NATALIA','CIBELE','RHAYSA','DEBORA','THAYNARA','KAMYLA','JULIA','FABIANA','MAYRA','LARISSA','CAROLINE','CLAUDIA','LYSIA','SHIRLAYNE','TEREZA','MILENE','KALYNNE','WINNY','THAIS','BEATRIZ','CECÍLIA','WILLIANE','PRISCYLA','JANAINA','SURAMA','TÂMARA','HÉVILA','DIRLEYNNE','LÉIA','JAMILLE','FLAVIA','TACIANE','KARLA','IVHINNY'];
            const isFem = femNames.some(n => s.nome.includes(n));
            
            if(s.cia === '2ª CIA') {
                s.canga_id = (s.numero % 2 !== 0) ? s.id + 1 : s.id - 1;
            } else {
                const cangaMap = { 1:7, 7:1, 34:36, 36:34, 53:93, 93:53, 108:172, 172:108, 147:185, 185:147, 192:147, 10:24, 24:10, 52:73, 73:52, 83:96, 96:83, 89:111, 111:89, 115:152, 152:115, 121:165, 165:121, 3:15, 15:3, 31:40, 40:31, 173:69, 69:173, 75:84, 84:75, 56:69, 9:110, 110:9, 28:118, 118:28, 54:132, 132:54, 63:140, 140:63, 82:88, 88:82, 162:82, 2:11, 11:2, 30:37, 37:30, 39:66, 66:39, 57:142, 142:57, 101:175, 175:101, 133:195, 195:133, 19:25, 25:19, 46:70, 70:46, 90:97, 97:90, 112:135, 135:112, 148:151, 151:148, 8:176, 176:8, 67:94, 94:67, 136:150, 150:136, 33:136, 12:42, 42:12, 68:103, 103:68, 134:154, 154:134, 179:134, 13:43, 43:13, 77:104, 104:77, 139:156, 156:139, 181:139 };
                if(cangaMap[s.numero]) s.canga_id = s.id - s.numero + cangaMap[s.numero];
            }

            if(isFem) s.alojamento = ['Carandiru', 'Apto 01', 'Apto 02', 'Apto 03'][s.numero % 4];
            else s.alojamento = (s.numero % 2 === 0) ? 'Aloj. Bravo' : 'Aloj. Alpha';

            return s;
        },

        deleteRecord(s, idx) { if(confirm('Apagar?')) { s.history = s.history.filter((_, i) => i !== idx); this.saveData(s); } },
        claimReward(s) { if(confirm('Confirmar?')) { if(!s.rewards_claimed) s.rewards_claimed = 0; s.rewards_claimed++; s.history = [...(s.history||[]), { type: 'ELOGIO', motivo: 'Ciclo Completado', data: new Date().toISOString().split('T')[0], oficial: 'SISTEMA' }]; this.saveData(s); } },
        getRawScore(s) { if(!s.history) return 0; return s.history.reduce((acc, curr) => (curr.type && curr.type.includes('FO+')) ? acc + 1 : ((curr.type && curr.type.includes('FO-')) ? acc - 1 : acc), 0); },
        getCycleScore(s) { return this.getRawScore(s) - ((s.rewards_claimed || 0) * 5); },
        openModal(student, category) { this.modals.record.student = student; this.modals.record.category = category; const defaultType = category === 'FO' ? 'FO+' : 'MEDIDA_LEVE'; this.forms.record = { type: defaultType, motivo: '', data: new Date().toISOString().split('T')[0], oficial: '', sei: '' }; this.modals.record.show = true; },
        
        async submitRecord() {
            // ⚠️ IMPORTANTE: COLE AQUI O LINK DA SUA PLANILHA (DO DEPLOY)
            const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycby7m4vpFrjkUZwhj0iyXF_xBo8r492Puf9Ey5lv4DTvgBKGw71K-k7HM-WZ0mT0NJmL/exec'; 

            const s = this.modals.record.student;
            const finalOfficial = this.forms.record.oficial === 'Outro' ? this.forms.record.customOficial : this.forms.record.oficial;
            
            const newEntry = { 
                type: this.forms.record.type, 
                motivo: this.forms.record.motivo, 
                data: this.forms.record.data, 
                oficial: finalOfficial, 
                sei: this.forms.record.sei, 
                timestamp: Date.now() 
            };

            let dataFormatada = newEntry.data;
            if(newEntry.data && newEntry.data.includes('-')) {
                const partes = newEntry.data.split('-');
                dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
            }

            try {
                s.history = [...(s.history || []), newEntry];
                await this.saveData(s);
                console.log("✅ Salvo no Supabase com sucesso.");
            } catch (err) {
                console.error("❌ Erro ao salvar no Supabase:", err);
                alert("Erro ao salvar no banco de dados.");
                return;
            }
            
            console.log("📤 Enviando para Planilha...");
            
            const dadosParaPlanilha = {
                data: dataFormatada,
                nome: s.nome,
                numero: s.numero, 
                tipo: newEntry.type,
                motivo: newEntry.motivo,
                sei: newEntry.sei || "",
                oficial: newEntry.oficial
            };

            console.log("📦 DADOS ENVIADOS PARA O GOOGLE:", dadosParaPlanilha);

            fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(dadosParaPlanilha)
            })
            .then(response => response.json())
            .then(data => {
                console.log("✅ Resposta da Planilha:", data);
            })
            .catch(err => console.error("❌ Erro ao enviar para Planilha:", err));

            this.modals.record.show = false;
            alert("Registro salvo!");
        },

        openRewardsModal() { this.modals.rewards.show = true; },
        openHistory(s) { this.modals.history.student = s; this.modals.history.show = true; },
        generateReport() { const date = this.forms.report.date; const list = this.students.filter(s => s.cia === this.session.currentCia); const pun = [], neg = [], pos = []; list.forEach(s => { if(!s.history) return; s.history.forEach(h => { if(h.data === date) { const item = { studentName: s.nome, typeLabel: this.getEventLabel(h.type), reason: h.motivo, officer: h.oficial, sei: h.sei }; if(h.type.includes('FO+')) pos.push(item); else if(h.type.includes('FO-')) neg.push(item); else if(!h.type.includes('ELOGIO')) pun.push(item); } }); }); this.forms.report.data = { punishments: pun, neg, pos }; },
        clearFilters() { this.ui.search = ''; this.ui.filters = { pelotao: '', plantao: '', alojamento: '' }; },
        getBorderClass(s) { const sc = this.getCycleScore(s); if(sc >= 5) return 'border-green-500'; if(sc < 0) return 'border-red-500'; return 'border-transparent'; },
        getBorderColor(type) { if(!type) return 'border-gray-300'; if(type.includes('FO+')) return 'border-green-500'; if(type.includes('FO-')) return 'border-red-500'; if(type.includes('ELOGIO')) return 'border-blue-500'; return 'border-orange-500'; },
        getEventLabel(type) { if(!type) return '-'; const labels = { 'FO+': 'FO (+)', 'FO-': 'FO (-)', 'PUNICAO': 'Punição', 'MEDIDA_LEVE': 'M. Educativa (L)', 'MEDIDA_MEDIA': 'M. Educativa (M)', 'MEDIDA_GRAVE': 'M. Educativa (G)', 'ELOGIO': 'Elogio' }; return labels[type] || type; },
        formatDate(d) { if(!d) return '-'; const [y,m,d2] = d.split('-'); return `${d2}/${m}/${y}`; },

        async enviarRelatorioWhatsApp() {
            if (!this.forms.report.auxiliar || !this.forms.report.adjunto) {
                alert("Por favor, preencha o nome do Auxiliar e do Adjunto na tela antes de enviar.");
                return;
            }

            const oficialDia = prompt("Nome do Oficial de Dia:", "2º TEN QOAPM BRÍGIDA");
            if (!oficialDia) return;
            
            const auxiliarNome = this.forms.report.auxiliar.toUpperCase();
            const adjuntoNome = this.forms.report.adjunto.toUpperCase();

            const hoje = this.forms.report.date;
            const fosDoDia = [];
            const punicoesDoDia = [];

            this.students.forEach(aluno => {
                if (aluno.history) {
                    aluno.history.forEach(reg => {
                        if (reg.data === hoje) {
                            const textoReg = `* ${aluno.numero} ${aluno.nome}: ${reg.motivo} (Of. ${reg.oficial})`;
                            if (reg.type.includes('FO+')) fosDoDia.push(textoReg);
                            else punicoesDoDia.push(textoReg);
                        }
                    });
                }
            });

            const listaFos = fosDoDia.length ? fosDoDia.join('\n') : "* Sem alterações.";
            const listaPunicoes = punicoesDoDia.length ? punicoesDoDia.join('\n') : "* Sem alterações.";
            const efetivo = this.students.filter(s => s.cia === this.session.currentCia).length;

            const relatorio = `*🔰 SDS – PMPE – DGA – DEIP – APMP 🔰*

*RELATÓRIO DE PASSAGEM DE SERVIÇO DO AUXILIAR DO OFICIAL DE DIA – ${this.session.currentCia}*

📌 Oficial de Dia: ${oficialDia}
📌 Auxiliar do Oficial de Dia: ${auxiliarNome}
📌 Adjunto ao Auxiliar: ${adjuntoNome}

🗓 Data: ${this.formatDate(hoje)}
⏰ Horário: 07h às 07h
🪖 Plantão: ÍNDIA

---

*🛡 ESCALA DE PERMANÊNCIA POR POSTO*
📍 Fiscalização dos Postos – Rondas Noturnas
* Auxiliar: ${auxiliarNome}
* Adjunto: ${adjuntoNome}

---

*📍 DIRETÓRIO ACADÊMICO GUARARAPES (D.A.G)*

1º (22h00–23h00)
* AL CFO PM 

2º (23h00–00h30)
* AL CFO PM 

3º (00h30–02h00)
* AL CFO PM 

4º (02h00–03h30)
* AL CFO PM 

5º (03h30–05h00)
* AL CFO PM 

---

*📍 ALAMEDAS ALFA E BRAVO*

1º (22h00–23h00)
* AL CFO PM 

2º (23h00–00h30)
* AL CFO PM 

3º (00h30–02h00)
* AL CFO PM 

4º (02h00–03h30)
* AL CFO PM 

5º (03h30–05h00)
* AL CFO PM 

---

*📍 ALAMEDA FEMININO*

1º (22h00–23h00)
* AL CFO PM 

2º (23h00–00h30)
* AL CFO PM 

3º (00h30–02h00)
* AL CFO PM 

4º (02h00–03h30)
* AL CFO PM 

5º (03h30–05h00)
* AL CFO PM 

---

*📍 PÁTIO INTERNO E ALAMEDA RANCHO*

1º (22h00–23h00)
* AL CFO PM 

2º (23h00–00h30)
* AL CFO PM 

3º (00h30–02h00)
* AL CFO PM 

4º (02h00–03h30)
* AL CFO PM 

5º (03h30–05h00)
* AL CFO PM 

---

*⭐ FATO OBSERVADO POSITIVAMENTE (FO+)*
${listaFos}

*⚠️ ALTERAÇÕES DISCIPLINARES*
${listaPunicoes}

---

*📌 OBSERVAÇÕES*
* Total de presentes: ${efetivo}
* Controle de materiais: Sem alterações.
* Ocorrências: Sem alterações.

---

📍 Paudalho – PE, ${new Date().toLocaleDateString('pt-BR')}

${auxiliarNome}
Auxiliar do Oficial de Dia

${adjuntoNome}
Adjunto ao Auxiliar

🛡 “Nossa Presença, Sua Segurança.”`;

            const textoCodificado = encodeURIComponent(relatorio);
            const url = `https://api.whatsapp.com/send?text=${textoCodificado}`;
            window.open(url, '_blank');
        }
    },
    mounted() { 
        if(localStorage.getItem('SIGA_DB_MASTER_V35_CONNECTED')) {
            this.session.isLoggedIn = true;
            this.loadData();
        }
    }
}).mount('#app');
