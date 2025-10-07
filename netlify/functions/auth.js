// netlify/functions/auth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('./database');

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

      // Verifică dacă este admin
      if (email === process.env.ADMIN_EMAIL) {
        if (password === process.env.ADMIN_PASSWORD) {
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
            body: JSON.stringify({ error: 'Parolă incorectă pentru administrator' })
          };
        }
      }

      // Verifică utilizator normal
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('is_verified', true)
        .single();

      if (error) {
        console.error('Eroare la căutarea utilizatorului:', error);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Email sau parolă incorectă' })
        };
      }

      if (user && await bcrypt.compare(password, user.password_hash)) {
        const token = jwt.sign(
          { 
            id: user.id, 
            email: user.email, 
            isAdmin: user.is_admin 
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
              id: user.id,
              email: user.email,
              nume: user.nume,
              numar_carnet: user.numar_carnet,
              clasa: user.clasa,
              isAdmin: user.is_admin
            }
          })
        };
      }

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Email sau parolă incorectă' })
      };

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