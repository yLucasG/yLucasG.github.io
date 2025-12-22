const { createApp, reactive } = Vue;

// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://iogtissohqhgxiskzgvc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZ3Rpc3NvaHFoZ3hpc2t6Z3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MDAwNTEsImV4cCI6MjA3ODA3NjA1MX0.4Fj05iwaUNDpdDaAch-dGp5TUtcumV72uzpIovQeCbg';

// Inicializa o cliente
const sbClient = (window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

createApp({
    data() {
        return {
            session: { isLoggedIn: false, pwd: '', currentCia: '2ª CIA', dataVersion: 0 },
            ui: { menuOpen: false, currentView: 'dashboard', search: '', viewMode: 'grid', filters: { pelotao: '', plantao: '', alojamento: '' } },
            students: [],
            isImprovingText: false,
            lists: { officers: ["Cel PM Carneiro","Ten Cel PM Andreza","Maj PM Juliane Santana","Maj PM Emanuela","Cap PM Marlon","Cap PM Arantes","Cap PM Nascimento","1º Ten PM Otávio Neto","1º Ten PM Letícia","1º Ten PM Kemuel","2º Ten PM Ribeiro","2º Ten PM Paulo Lima","2º Ten PM Thaysa","2º Ten PM Pedro Lima","2º Ten PM Vasconcelos","2º Ten PM Brígida","2º Ten PM Gudemberg","2º Ten PM Melquezedeque","2º Ten PM Viviane","Outro"] },
            modals: { record: { show: false, student: null, category: 'FO' }, history: { show: false, student: null }, rewards: { show: false } },
            forms: { 
                record: { type: 'FO+', motivo: '', data: '', oficial: '', customOficial: '', sei: '' }, 
                report: { 
                    date: new Date().toISOString().split('T')[0], 
                    auxiliar: '', 
                    adjunto: '', // ADICIONEI ISSO AQUI
                    data: { punishments: [], neg: [], pos: [] } 
                } 
            }
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
                // CORREÇÃO AQUI: Mudou de cangaId para canga_id
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
                console.log("Banco vazio, iniciando reset...");
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
                // Aqui o erro acontecia porque o objeto tinha 'cangaId' mas o banco queria 'canga_id'
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

        async resetDatabase() {
            if(!confirm('ATENÇÃO: Isso vai apagar o banco atual e recarregar a lista padrão com os Plantões e Pelotões corretos. Continuar?')) return;
            
            // DADOS 2ª CIA
            const cia2Input = [
                {id:1,nome:"MÁRCIO SOUZA",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:5,nome:"SILVANA",pel:"5º PEL/2ª CIA",plant:"FOXTROT"},{id:7,nome:"ARCOVERDE",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:13,nome:"BRENDA",pel:"3º PEL/2ª CIA",plant:"FOXTROT"},{id:16,nome:"THIAGO TAVARES",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:21,nome:"MANOEL",pel:"5º PEL/2ª CIA",plant:"FOXTROT"},{id:25,nome:"DAVI OLIVEIRA",pel:"3º PEL/2ª CIA",plant:"FOXTROT"},{id:34,nome:"GIOVANNI",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:37,nome:"VALDECI",pel:"2º PEL/2ª CIA",plant:"FOXTROT"},{id:38,nome:"W. SILVA",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:42,nome:"CARLA ARAUJO",pel:"2º PEL/2ª CIA",plant:"FOXTROT"},{id:45,nome:"WALYSON",pel:"5º PEL/2ª CIA",plant:"FOXTROT"},{id:49,nome:"JEFFERSON SILVA",pel:"6º PEL/2ª CIA",plant:"FOXTROT"},{id:53,nome:"G. SILVA",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:58,nome:"WESLEY",pel:"5º PEL/2ª CIA",plant:"FOXTROT"},{id:63,nome:"PAULO",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:67,nome:"LAYANNE",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:69,nome:"FALCÃO",pel:"3º PEL/2ª CIA",plant:"FOXTROT"},{id:73,nome:"PEREIRA",pel:"2º PEL/2ª CIA",plant:"FOXTROT"},{id:79,nome:"DIOGENES",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:83,nome:"P. SOUZA",pel:"2º PEL/2ª CIA",plant:"FOXTROT"},{id:87,nome:"ARYCLAYTON",pel:"6º PEL/2ª CIA",plant:"FOXTROT"},{id:91,nome:"GESSICA",pel:"5º PEL/2ª CIA",plant:"FOXTROT"},{id:93,nome:"REVERTHON",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:98,nome:"EMANNUEL",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:102,nome:"ALLAN MARIANO",pel:"5º PEL/2ª CIA",plant:"FOXTROT"},{id:103,nome:"RAISSA SOARES",pel:"2º PEL/2ª CIA",plant:"FOXTROT"},{id:110,nome:"CÉSAR MEDEIROS",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:114,nome:"BARBALHO",pel:"5º PEL/2ª CIA",plant:"FOXTROT"},{id:118,nome:"DURVAL",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:122,nome:"BATISTA",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:128,nome:"ALEXANDRO GOMES",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:131,nome:"RENATA",pel:"6º PEL/2ª CIA",plant:"FOXTROT"},{id:133,nome:"ISRAEL",pel:"2º PEL/2ª CIA",plant:"FOXTROT"},{id:140,nome:"VICTOR COSTA",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:141,nome:"JULIANE CORDEIRO",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:147,nome:"JORGE FILHO",pel:"1º PEL/2ª CIA",plant:"FOXTROT"},{id:153,nome:"AFONSO",pel:"3º PEL/2ª CIA",plant:"FOXTROT"},{id:154,nome:"DAYANE",pel:"2º PEL/2ª CIA",plant:"FOXTROT"},{id:158,nome:"HEYVERSON",pel:"5º PEL/2ª CIA",plant:"FOXTROT"},{id:164,nome:"CIBELE",pel:"6º PEL/2ª CIA",plant:"FOXTROT"},{id:166,nome:"FELIPE FELIX",pel:"3º PEL/2ª CIA",plant:"FOXTROT"},{id:170,nome:"ANTONIO REIS",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:174,nome:"LIMA PAIVA",pel:"6º PEL/2ª CIA",plant:"FOXTROT"},{id:182,nome:"JOSINALDO",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},{id:191,nome:"SELTON",pel:"4º PEL/2ª CIA",plant:"FOXTROT"},
                {id:2,nome:"RENATO",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:6,nome:"DANIELLE PRADO",pel:"6º PEL/2ª CIA",plant:"GOLF"},{id:9,nome:"R. FERREIRA",pel:"1º PEL/2ª CIA",plant:"GOLF"},{id:14,nome:"AMANDA COELHO",pel:"4º PEL/2ª CIA",plant:"GOLF"},{id:15,nome:"JUNIOR",pel:"3º PEL/2ª CIA",plant:"GOLF"},{id:20,nome:"LUAN PEREIRA",pel:"4º PEL/2ª CIA",plant:"GOLF"},{id:24,nome:"MATHEUS MESQUITA",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:30,nome:"M ALBUQUERQUE",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:33,nome:"KAROLINE ABREU",pel:"1º PEL/2ª CIA",plant:"GOLF"},{id:35,nome:"PAULINO",pel:"6º PEL/2ª CIA",plant:"GOLF"},{id:39,nome:"ELLIO",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:46,nome:"GRANGEIRO",pel:"3º PEL/2ª CIA",plant:"GOLF"},{id:50,nome:"QUEIROZ",pel:"6º PEL/2ª CIA",plant:"GOLF"},{id:54,nome:"FRANÇA",pel:"1º PEL/2ª CIA",plant:"GOLF"},{id:59,nome:"RAYANNE",pel:"6º PEL/2ª CIA",plant:"GOLF"},{id:60,nome:"S.GOMES",pel:"6º PEL/2ª CIA",plant:"GOLF"},{id:64,nome:"BONFIM",pel:"6º PEL/2ª CIA",plant:"GOLF"},{id:71,nome:"SERAFIM",pel:"4º PEL/2ª CIA",plant:"GOLF"},{id:74,nome:"GABRIEL",pel:"6º PEL/2ª CIA",plant:"GOLF"},{id:78,nome:"GISELE FERREIRA",pel:"4º PEL/2ª CIA",plant:"GOLF"},{id:80,nome:"JOSE",pel:"5º PEL/2ª CIA",plant:"GOLF"},{id:84,nome:"SIDNEI ARAÚJO",pel:"3º PEL/2ª CIA",plant:"GOLF"},{id:88,nome:"S. NETO",pel:"1º PEL/2ª CIA",plant:"GOLF"},{id:99,nome:"G. GOMES",pel:"4º PEL/2ª CIA",plant:"GOLF"},{id:105,nome:"JOSÉ NETO",pel:"5º PEL/2ª CIA",plant:"GOLF"},{id:108,nome:"HENRIQUE",pel:"1º PEL/2ª CIA",plant:"GOLF"},{id:113,nome:"AURÉLIO",pel:"4º PEL/2ª CIA",plant:"GOLF"},{id:119,nome:"VINÍCIUS SOUZA",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:123,nome:"GONZAGA",pel:"5º PEL/2ª CIA",plant:"GOLF"},{id:129,nome:"LUIZ NUNES",pel:"5º PEL/2ª CIA",plant:"GOLF"},{id:134,nome:"SAMEA FERRAZ",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:135,nome:"JOÃO HENRIQUE",pel:"3º PEL/2ª CIA",plant:"GOLF"},{id:142,nome:"JABNER",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:143,nome:"SAMARA MELO",pel:"5º PEL/2ª CIA",plant:"GOLF"},{id:152,nome:"MOURA",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:156,nome:"MONALIZA",pel:"3º PEL/2ª CIA",plant:"GOLF"},{id:161,nome:"JOSE ALISSON",pel:"6º PEL/2ª CIA",plant:"GOLF"},{id:165,nome:"GUSTAVO",pel:"2º PEL/2ª CIA",plant:"GOLF"},{id:168,nome:"LEONAM",pel:"5º PEL/2ª CIA",plant:"GOLF"},{id:172,nome:"FRANCISCO",pel:"1º PEL/2ª CIA",plant:"GOLF"},{id:180,nome:"NOBREGA",pel:"5º PEL/2ª CIA",plant:"GOLF"},{id:181,nome:"THAYNARA",pel:"3º PEL/2ª CIA",plant:"GOLF"},{id:190,nome:"JÚLIA",pel:"5º PEL/2ª CIA",plant:"GOLF"},{id:192,nome:"JEFFERSON GOMES",pel:"1º PEL/2ª CIA",plant:"GOLF"},{id:196,nome:"CARDOSO",pel:"6º PEL/2ª CIA",plant:"GOLF"},
                // INDIA
                {id:4,nome:"ROBERTO FREITAS",pel:"4º PEL/2ª CIA",plant:"INDIA"},{id:11,nome:"ORLANDO",pel:"2º PEL/2ª CIA",plant:"INDIA"},{id:12,nome:"ISABELLA",pel:"2º PEL/2ª CIA",plant:"INDIA"},{id:19,nome:"ALENCAR",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:26,nome:"MARCOLINO",pel:"4º PEL/2ª CIA",plant:"INDIA"},{id:27,nome:"FATIMA AGUIAR",pel:"6º PEL/2ª CIA",plant:"INDIA"},{id:29,nome:"MACIEL",pel:"6º PEL/2ª CIA",plant:"INDIA"},{id:41,nome:"MALAQUIAS",pel:"4º PEL/2ª CIA",plant:"INDIA"},{id:44,nome:"PRISCILA CORREIA",pel:"4º PEL/2ª CIA",plant:"INDIA"},{id:48,nome:"ELVIS",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:52,nome:"RUBSLEY",pel:"2º PEL/2ª CIA",plant:"INDIA"},{id:57,nome:"SANTANA",pel:"2º PEL/2ª CIA",plant:"INDIA"},{id:61,nome:"FIRMINO",pel:"4º PEL/2ª CIA",plant:"INDIA"},{id:62,nome:"LUCAS MAGALHÃES",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:68,nome:"KAROLINNE MOREIRA",pel:"2º PEL/2ª CIA",plant:"INDIA"},{id:72,nome:"NONATO",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:76,nome:"FERREIRA",pel:"4º PEL/2ª CIA",plant:"INDIA"},{id:82,nome:"MARCOS NASCIMENTO",pel:"1º PEL/2ª CIA",plant:"INDIA"},{id:86,nome:"FERNANDO CRUZ",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:90,nome:"RAFAEL BEZERRA",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:92,nome:"ALINE",pel:"6º PEL/2ª CIA",plant:"INDIA"},{id:95,nome:"BRUNO",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:97,nome:"ITALO",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:100,nome:"RENAN",pel:"6º PEL/2ª CIA",plant:"INDIA"},{id:112,nome:"MARQUES",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:116,nome:"SANTIAGO",pel:"6º PEL/2ª CIA",plant:"INDIA"},{id:120,nome:"EGITO",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:121,nome:"JOÃO NASCIMENTO",pel:"2º PEL/2ª CIA",plant:"INDIA"},{id:126,nome:"GILMARA",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:130,nome:"PAULO ROBERTO",pel:"6º PEL/2ª CIA",plant:"INDIA"},{id:132,nome:"SERGIO",pel:"1º PEL/2ª CIA",plant:"INDIA"},{id:139,nome:"JULIANA GONDIM",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:145,nome:"HIGOR ALVES",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:146,nome:"PEREIRA MORAIS",pel:"6º PEL/2ª CIA",plant:"INDIA"},{id:148,nome:"OLAVO",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:150,nome:"ROBERTA",pel:"1º PEL/2ª CIA",plant:"INDIA"},{id:157,nome:"VALADARES",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:163,nome:"NATALIA",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:169,nome:"MATHEUS BARROS",pel:"6º PEL/2ª CIA",plant:"INDIA"},{id:173,nome:"IURY",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:176,nome:"RHAYSA",pel:"1º PEL/2ª CIA",plant:"INDIA"},{id:178,nome:"HIAGO",pel:"4º PEL/2ª CIA",plant:"INDIA"},{id:186,nome:"SOUTO",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:188,nome:"MAXEMBERG",pel:"3º PEL/2ª CIA",plant:"INDIA"},{id:194,nome:"KLEVER",pel:"5º PEL/2ª CIA",plant:"INDIA"},{id:195,nome:"PETTERSON",pel:"2º PEL/2ª CIA",plant:"INDIA"},
                // HOTEL
                {id:3,nome:"FERNANDO",pel:"3º PEL/2ª CIA",plant:"HOTEL"},{id:8,nome:"AUREA",pel:"1º PEL/2ª CIA",plant:"HOTEL"},{id:10,nome:"VICTOR FERREIRA",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:17,nome:"MURILO",pel:"5º PEL/2ª CIA",plant:"HOTEL"},{id:18,nome:"ARYANA",pel:"5º PEL/2ª CIA",plant:"HOTEL"},{id:28,nome:"LEMOS",pel:"1º PEL/2ª CIA",plant:"HOTEL"},{id:31,nome:"ALLATAS SOUSA",pel:"3º PEL/2ª CIA",plant:"HOTEL"},{id:32,nome:"KAYO GABRIEL",pel:"5º PEL/2ª CIA",plant:"HOTEL"},{id:36,nome:"M. FEITOSA",pel:"1º PEL/2ª CIA",plant:"HOTEL"},{id:40,nome:"MARINHO",pel:"3º PEL/2ª CIA",plant:"HOTEL"},{id:43,nome:"CINTIA SOUZA",pel:"3º PEL/2ª CIA",plant:"HOTEL"},{id:47,nome:"MACEDO",pel:"4º PEL/2ª CIA",plant:"HOTEL"},{id:66,nome:"JONATAS SANTOS",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:70,nome:"MEIRA",pel:"3º PEL/2ª CIA",plant:"HOTEL"},{id:75,nome:"PEDRO",pel:"3º PEL/2ª CIA",plant:"HOTEL"},{id:77,nome:"EDUARDA",pel:"3º PEL/2ª CIA",plant:"HOTEL"},{id:81,nome:"COSTA",pel:"6º PEL/2ª CIA",plant:"HOTEL"},{id:85,nome:"ANDERSON",pel:"4º PEL/2ª CIA",plant:"HOTEL"},{id:89,nome:"SILVA",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:94,nome:"FERNANDA SOARES",pel:"1º PEL/2ª CIA",plant:"HOTEL"},{id:96,nome:"ERIVELTON",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:106,nome:"LUCAS RANIELLE",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:107,nome:"LUCIANO",pel:"6º PEL/2ª CIA",plant:"HOTEL"},{id:109,nome:"ERIKA DUARTE",pel:"4º PEL/2ª CIA",plant:"HOTEL"},{id:111,nome:"FELIPE MORAIS",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:115,nome:"VINICIUS OLIVEIRA",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:125,nome:"MEDEIROS",pel:"3º PEL/2ª CIA",plant:"HOTEL"},{id:127,nome:"CAIO GUIMARAES",pel:"6º PEL/2ª CIA",plant:"HOTEL"},{id:136,nome:"PATRICIA",pel:"1º PEL/2ª CIA",plant:"HOTEL"},{id:137,nome:"RAFAEL PEREIRA",pel:"6º PEL/2ª CIA",plant:"HOTEL"},{id:138,nome:"ICARO",pel:"5º PEL/2ª CIA",plant:"HOTEL"},{id:144,nome:"EDJANE",pel:"6º PEL/2ª CIA",plant:"HOTEL"},{id:149,nome:"CAVALCANTI",pel:"6º PEL/2ª CIA",plant:"HOTEL"},{id:151,nome:"OLIVEIRA JUNIOR",pel:"5º PEL/2ª CIA",plant:"HOTEL"},{id:162,nome:"JESUS",pel:"1º PEL/2ª CIA",plant:"HOTEL"},{id:171,nome:"JHONEY",pel:"5º PEL/2ª CIA",plant:"HOTEL"},{id:175,nome:"LUIZ LEAL",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:177,nome:"DIONIZIO",pel:"4º PEL/2ª CIA",plant:"HOTEL"},{id:179,nome:"DEBORA GOUVEIA",pel:"2º PEL/2ª CIA",plant:"HOTEL"},{id:183,nome:"JULIO",pel:"5º PEL/2ª CIA",plant:"HOTEL"},{id:184,nome:"ABRAÃO",pel:"6º PEL/2ª CIA",plant:"HOTEL"},{id:185,nome:"RONILSON",pel:"1º PEL/2ª CIA",plant:"HOTEL"},{id:187,nome:"BELEM",pel:"4º PEL/2ª CIA",plant:"HOTEL"},{id:189,nome:"KAMYLA",pel:"4º PEL/2ª CIA",plant:"HOTEL"},{id:193,nome:"JAILTON",pel:"6º PEL/2ª CIA",plant:"HOTEL"},{id:197,nome:"ISRAEL OLIVEIRA",pel:"4º PEL/2ª CIA",plant:"HOTEL"}
            ];
            
            // MAPEAR 2ª CIA (CORREÇÃO DE PELOTÃO E PLANTÃO)
            const cia2List = cia2Input.map(s => ({
                id: s.id,
                numero: s.id,
                nome: s.nome,
                cia: '2ª CIA',
                pelotao: s.pel,     
                plantao: s.plant,   
                history: []
            }));

            // DADOS 3ª CIA
            const cia3 = [
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
            ].map(s => ({...s, id: 3000 + s.numero, cia: '3ª CIA', history: []}));
            
            [...cia2List, ...cia3].forEach(s => this.assignAttributes(s));
            this.students = [...cia2List, ...cia3];
            this.saveData();
            this.session.dataVersion++;
        },

        assignAttributes(s) {
            if(s.cia === '3ª CIA') {
                const shifts = ['INDIA', 'FOXTROT', 'GOLF', 'HOTEL'];
                s.plantao = shifts[s.numero % 4];
                s.pelotao = `${((s.numero - 1) % 6) + 1}º PEL/3ª CIA`;
                s.canga_id = (s.numero % 2 !== 0) ? s.id + 1 : s.id - 1;
            } else {
                const cangaMap = { 1:7, 7:1, 34:36, 36:34, 53:93, 93:53, 108:172, 172:108, 147:185, 185:147, 192:147, 10:24, 24:10, 52:73, 73:52, 83:96, 96:83, 89:111, 111:89, 115:152, 152:115, 121:165, 165:121, 3:15, 15:3, 31:40, 40:31, 173:69, 69:173, 75:84, 84:75, 56:69, 9:110, 110:9, 28:118, 118:28, 54:132, 132:54, 63:140, 140:63, 82:88, 88:82, 162:82, 2:11, 11:2, 30:37, 37:30, 39:66, 66:39, 57:142, 142:57, 101:175, 175:101, 133:195, 195:133, 19:25, 25:19, 46:70, 70:46, 90:97, 97:90, 112:135, 135:112, 148:151, 151:148, 8:176, 176:8, 67:94, 94:67, 136:150, 150:136, 33:136, 12:42, 42:12, 68:103, 103:68, 134:154, 154:134, 179:134, 13:43, 43:13, 77:104, 104:77, 139:156, 156:139, 181:139 };
                // CORREÇÃO: Usar canga_id para bater com banco de dados
                if(cangaMap[s.numero]) s.canga_id = s.id - s.numero + cangaMap[s.numero];
            }
            
            const femNames = ['OLGA','MIRELLY','ANA','SILVANA','DANIELLE','AUREA','ISABELLA','BRENDA','AMANDA','ARYANA','FATIMA','KAROLINE','CINTIA','PRISCILA','LAYANNE','KAROLINNE','EDUARDA','GISELE','GESSICA','ALINE','FERNANDA','RAISSA','ERIKA','GILMARA','RENATA','SAMEA','PATRICIA','JULIANA','JULIANE','SAMARA','EDJANE','ROBERTA','MONALIZA','NATALIA','CIBELE','RHAYSA','DEBORA','THAYNARA','KAMYLA','JULIA','FABIANA','MAYRA','LARISSA','CAROLINE','CLAUDIA','LYSIA','SHIRLAYNE','TEREZA','MILENE','KALYNNE','WINNY','THAIS','BEATRIZ','CECÍLIA','WILLIANE','PRISCYLA','JANAINA','SURAMA','TÂMARA','HÉVILA','DIRLEYNNE','LÉIA','JAMILLE','FLAVIA','TACIANE','KARLA','IVHINNY'];
            const isFem = femNames.some(n => s.nome.includes(n));
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
    // ⚠️
    const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwyCpKaxAPjK6n1WAht85o1BzbMbQ0b-wiR9GJwdypPRefCv3egDux-sThYPiXsddsrDg/exec
'; 

    const s = this.modals.record.student;
    const finalOfficial = this.forms.record.oficial === 'Outro' ? this.forms.record.customOficial : this.forms.record.oficial;
    
    // Objeto do registro
    const newEntry = { 
        type: this.forms.record.tipo, 
        motivo: this.forms.record.motivo, 
        data: this.forms.record.data, 
        oficial: finalOfficial, 
        sei: this.forms.record.sei, 
        timestamp: Date.now() 
    };

    // 1. Formata a data (DD/MM/AAAA) para a Planilha ficar bonita
    let dataFormatada = newEntry.data;
    if(newEntry.data && newEntry.data.includes('-')) {
        const partes = newEntry.data.split('-');
        dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    // 2. Salva no Supabase (Banco do Site)
    // Adicionamos try/catch para garantir que erros aqui não travem o resto
    try {
        s.history = [...(s.history || []), newEntry];
        await this.saveData(s);
        console.log("✅ Salvo no Supabase com sucesso.");
    } catch (err) {
        console.error("❌ Erro ao salvar no Supabase:", err);
        alert("Erro ao salvar no banco de dados.");
        return; // Para tudo se o banco falhar
    }
    
    // 3. Envia para o Google Planilhas
    console.log("📤 Enviando para Planilha...");
    
    const dadosParaPlanilha = {
        data: dataFormatada,
        nome: s.nome,
        numero: s.numero, // Pode ir vazio se não tiver, mas ajuda a identificar
        tipo: newEntry.type,
        motivo: newEntry.motivo,
        sei: newEntry.sei || "",
        oficial: newEntry.oficial
    };

    // TRUQUE: Usamos 'text/plain' para evitar erro de CORS (Preflight)
    fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(dadosParaPlanilha)
    })
    .then(response => response.json())
    .then(data => {
        console.log("✅ Resposta da Planilha:", data);
        if(data.status === 'sucesso') {
             // Opcional: Avisar o usuário discretamente ou só manter no log
        }
    })
    .catch(err => console.error("❌ Erro ao enviar para Planilha:", err));

    // Fecha o modal e avisa
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



        // Adicione isso junto aos outros methods
// Substitua o método enviarRelatorioWhatsApp antigo por este:

async enviarRelatorioWhatsApp() {
    // 1. Validação Simples
    if (!this.forms.report.auxiliar || !this.forms.report.adjunto) {
        alert("Por favor, preencha o nome do Auxiliar e do Adjunto na tela antes de enviar.");
        return;
    }

    const oficialDia = prompt("Nome do Oficial de Dia:", "2º TEN QOAPM BRÍGIDA");
    if (!oficialDia) return;
    
    // Pega os nomes direto dos campos que você digitou na tela
    const auxiliarNome = this.forms.report.auxiliar.toUpperCase();
    const adjuntoNome = this.forms.report.adjunto.toUpperCase();

    // 2. Coleta Fatos e Punições
    const hoje = this.forms.report.date; // Usa a data selecionada na tela, não necessariamente "hoje"
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

    // 3. Monta o Relatório com os Novos Postos e Espaços em Branco
    const relatorio = `*🔰 SDS – PMPE – DGA – DEIP – APMP 🔰*

*RELATÓRIO DE PASSAGEM DE SERVIÇO DO AUXILIAR DO OFICIAL DE DIA – 1ª CIA*

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

    // 4. Enviar
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






