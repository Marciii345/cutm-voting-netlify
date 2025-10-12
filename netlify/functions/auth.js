// netlify/functions/auth.js
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'POST') {
    try {
      const { email, password } = JSON.parse(event.body);

      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Email și parola sunt obligatorii' })
        };
      }

      // Verifică doar pentru administrator
      if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign(
          { 
            email: email, 
            isAdmin: true,
            userId: 'admin'
          }, 
          process.env.JWT_SECRET, 
          { expiresIn: '24h' }
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            token,
            user: { 
              email: email, 
              isAdmin: true, 
              nume: "Administrator Sistem",
              role: "super_admin"
            }
          })
        };
      } else {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Date de autentificare incorecte pentru administrator' })
        };
      }

    } catch (error) {
      console.error('Eroare autentificare:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Eroare internă server' })
      };
    }
  }

  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};