// netlify/functions/status.js
const supabase = require('./database');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      // Verificare token
      const token = event.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            authenticated: false,
            error: "Token required"
          })
        };
      }

      const { verify } = require('jsonwebtoken');
      const userData = verify(token, process.env.JWT_SECRET);

      // Dacă este admin
      if (userData.isAdmin) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            authenticated: true,
            isAdmin: true,
            has_voted: false,
            is_verified: true,
            user_name: "Administrator",
            user_email: userData.email,
            role: "super_admin"
          })
        };
      }

      // Pentru utilizatori normali - CORECTAT cu Supabase
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userData.id)
        .single();

      if (userError || !user) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            authenticated: false,
            has_voted: false,
            error: "Utilizatorul nu a fost găsit"
          })
        };
      }

      // Verifică dacă utilizatorul este VERIFICAT - CORECTAT
      if (!user.is_verified) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            authenticated: true,
            has_voted: false,
            is_verified: false,
            user_name: user.nume,
            user_email: user.email,
            numar_carnet: user.numar_carnet,
            clasa: user.clasa,
            error: "Contul nu este verificat. Așteptați aprobarea administratorului."
          })
        };
      }

      // Verifică dacă a votat - CORECTAT cu Supabase
      const { data: vote, error: voteError } = await supabase
        .from('votes')
        .select('id')
        .eq('user_id', user.id)
        .single();

      const hasVoted = !!vote;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          authenticated: true,
          has_voted: hasVoted,
          is_verified: user.is_verified,
          is_admin: user.is_admin,
          user_name: user.nume,
          user_email: user.email,
          numar_carnet: user.numar_carnet,
          clasa: user.clasa,
          user_id: user.id
        })
      };
    }

    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: "Method not allowed" }) 
    };

  } catch (error) {
    console.error('Eroare status:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          authenticated: false,
          error: "Token invalid" 
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        authenticated: false,
        error: "Eroare internă server" 
      })
    };
  }
};