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

      // Pentru utilizatori normali
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

      // Verifică starea carnetului
      const { data: carnet, error: carnetError } = await supabase
        .from('verified_carnets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      let verification_status = 'not_submitted';
      let verification_message = '';
      let is_auto_verified = false;

      if (carnet) {
        if (carnet.status === 'approved') {
          verification_status = 'approved';
          is_auto_verified = carnet.auto_verified;
          verification_message = carnet.auto_verified 
            ? 'Cont verificat automat' 
            : 'Cont verificat de administrator';
        } else if (carnet.status === 'pending') {
          verification_status = 'pending';
          verification_message = carnet.admin_notes || 'În așteptarea verificării';
        } else if (carnet.status === 'rejected') {
          verification_status = 'rejected';
          verification_message = carnet.admin_notes || 'Carnet respins';
        }
      }

      // Verifică dacă a votat
      const { data: vote, error: voteError } = await supabase
        .from('votes')
        .select('id, president')
        .eq('user_id', user.id)
        .single();

      const hasVoted = !!vote;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        authenticated: true,
        has_voted: hasVoted,
        voted_candidate: vote ? vote.president : null,
        is_verified: carnet?.status === 'approved', // <<< IMPORTANT: consistent cu vote.js
        verification_status: verification_status,
        verification_message: verification_message,
        is_auto_verified: is_auto_verified,
        is_admin: user.is_admin,
        user_name: user.nume,
        user_email: user.email,
        numar_carnet: user.numar_carnet,
        clasa: user.clasa,
        user_id: user.id,
        message: hasVoted 
          ? "Ai votat deja. Mulțumim pentru participare!"
          : carnet?.status === 'approved'
            ? "Cont verificat! Acum poți vota."
            : verification_message
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