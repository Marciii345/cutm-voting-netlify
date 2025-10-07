// netlify/functions/vote.js
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
    // GET - Rezultate (accesibil fără autentificare pentru admin)
    if (event.httpMethod === 'GET') {
      const { data: results, error } = await supabase
        .from('votes')
        .select('president, vice_president, culture_minister, administration_minister, social_media_minister');

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
        president: {}, 
        vice_president: {}, 
        culture_minister: {},
        administration_minister: {}, 
        social_media_minister: {}
      };

      results.forEach(vote => {
        Object.keys(voteCounts).forEach(position => {
          const candidate = vote[position];
          if (candidate) {
            voteCounts[position][candidate] = (voteCounts[position][candidate] || 0) + 1;
          }
        });
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
      // Verificare token
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Token required' })
        };
      }

      const { verify } = require('jsonwebtoken');
      const user = verify(token, process.env.JWT_SECRET);

      const { president, vice_president, culture_minister, administration_minister, social_media_minister } = 
        JSON.parse(event.body);

      // Verifică dacă a votat deja
      const { data: existingVote, error: existingError } = await supabase
        .from('votes')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existingVote) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Ați votat deja' })
        };
      }

      // Verifică dacă utilizatorul este verificat
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_verified')
        .eq('id', user.id)
        .single();

      if (userError || !userData || !userData.is_verified) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Contul nu este verificat. Așteptați aprobarea administratorului.' })
        };
      }

      // Înregistrează votul
      const { error: voteError } = await supabase
        .from('votes')
        .insert([
          {
            user_id: user.id,
            president,
            vice_president,
            culture_minister,
            administration_minister,
            social_media_minister
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
    console.error('Eroare vot:', error);
    
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
      body: JSON.stringify({ error: 'Eroare internă server' })
    };
  }
};