// netlify/functions/database.js
const { createClient } = require('@supabase/supabase-js');

// Configurare Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Funcție de inițializare a tabelelor
const initDatabase = async () => {
  try {
    // Tabela users
    const { error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (usersError && usersError.code === 'PGRST204') {
      console.log('✅ Tabelele Supabase sunt gata de utilizare');
    }

  } catch (error) {
    console.error('❌ Eroare la verificarea tabelelor:', error);
  }
};

// Inițializează la pornire
initDatabase();

module.exports = supabase;