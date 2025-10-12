// netlify/functions/vote.js - SOLUȚIE FIX 403
const supabase = require('./database');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // GET - Rezultate (accesibil fără autentificare)
    if (event.httpMethod === 'GET') {
      const { data: results, error } = await supabase
        .from('votes')
        .select('president');

      if (error) {
        console.error('Eroare la preluarea voturilor:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Eroare la preluarea rezultatelor' })
        };
      }

      // Calculează rezultatele
      const voteCounts = {
        president: {}
      };

      results.forEach(vote => {
        const candidate = vote.president;
        if (candidate) {
          voteCounts.president[candidate] = (voteCounts.president[candidate] || 0) + 1;
        }
      });

      // Calculează procentele
      Object.keys(voteCounts).forEach(position => {
        const total = Object.values(voteCounts[position]).reduce((a, b) => a + b, 0);
        Object.keys(voteCounts[position]).forEach(candidate => {
          voteCounts[position][candidate] = {
            count: voteCounts[position][candidate],
            percentage: total > 0 ? ((voteCounts[position][candidate] / total) * 100).toFixed(1) : "0.0"
          };
        });
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, results: voteCounts })
      };
    }

    // POST - Înregistrare vot (necesită autentificare)
    if (event.httpMethod === 'POST') {
      console.log('🗳️ Început proces vot...');
      
      // Verificare token
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.log('❌ Token lipsă');
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Token required' })
        };
      }

      const { verify } = require('jsonwebtoken');
      let user;
      try {
        user = verify(token, process.env.JWT_SECRET);
        console.log('✅ Token valid pentru user:', user.id);
      } catch (tokenError) {
        console.log('❌ Token invalid:', tokenError.message);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Token invalid' })
        };
      }

      const { president } = JSON.parse(event.body);

      if (!president) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Trebuie să selectați un candidat pentru președinte' })
        };
      }

      console.log('🔍 Verificare dacă a votat deja...');
      
      // Verifică dacă a votat deja
      const { data: existingVote, error: existingError } = await supabase
        .from('votes')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existingVote) {
        console.log('❌ Utilizatorul a votat deja');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Ați votat deja' })
        };
      }

      console.log('🔍 Verificare stare carnet...');
      
      // VERIFICARE ÎMBUNĂTĂȚITĂ: Verifică dacă utilizatorul are carnet aprobat
      const { data: carnet, error: carnetError } = await supabase
        .from('verified_carnets')
        .select('status, auto_verified')
        .eq('user_id', user.id)
        .single();

      if (carnetError) {
        console.error('Eroare la verificarea carnetului:', carnetError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Eroare la verificarea stării carnetului' })
        };
      }

      if (!carnet) {
        console.log('❌ Utilizatorul nu are carnet înregistrat');
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Nu aveți un carnet verificat. Înregistrați-vă mai întâi.' })
        };
      }

      if (carnet.status !== 'approved') {
        console.log('❌ Carnetul nu este aprobat. Status:', carnet.status);
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            error: 'Contul nu este verificat. Nu puteți vota.',
            details: `Stare carnet: ${carnet.status}`
          })
        };
      }

      console.log('✅ Utilizator verificat - înregistrare vot...');

      // Înregistrează votul
      const { error: voteError } = await supabase
        .from('votes')
        .insert([
          {
            user_id: user.id,
            president: president
          }
        ]);

      if (voteError) {
        console.error('Eroare la înregistrare vot:', voteError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Eroare la înregistrarea votului' })
        };
      }

      console.log('✅ Vot înregistrat cu succes pentru user:', user.id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Vot înregistrat cu succes! Mulțumim pentru participare.' 
        })
      };
    }

    return { statusCode: 405, headers, body: 'Method Not Allowed' };

  } catch (error) {
    console.error('💥 Eroare vot:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Token invalid' })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Eroare internă server: ' + error.message })
    };
  }
};