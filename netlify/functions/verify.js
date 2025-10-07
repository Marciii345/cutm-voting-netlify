// netlify/functions/verify.js
const supabase = require('./database');
const bcrypt = require('bcryptjs');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'POST') {
    try {
      const { email, password, image_data, nume, numar_carnet, clasa } = JSON.parse(event.body);

      // Validări
      if (!email || !password || !image_data || !nume || !numar_carnet || !clasa) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Toate câmpurile sunt obligatorii' })
        };
      }

      if (password.length < 6) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Parola trebuie să aibă minim 6 caractere' })
        };
      }

      // Verifică dacă email-ul sau carnetul există deja
      const { data: existingUser, error: existingError } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq.${email},numar_carnet.eq.${numar_carnet}`)
        .single();

      if (existingUser) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Email-ul sau numărul de carnet există deja în sistem' })
        };
      }

      // Hash parolă
      const passwordHash = await bcrypt.hash(password, 12);

      // Inserează utilizatorul
      const { data: user, error: userError } = await supabase
        .from('users')
        .insert([
          { 
            email: email, 
            password_hash: passwordHash, 
            nume: nume, 
            numar_carnet: numar_carnet, 
            clasa: clasa, 
            is_verified: false 
          }
        ])
        .select()
        .single();

      if (userError) {
        console.error('Eroare la inserare utilizator:', userError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Eroare la înregistrare' })
        };
      }

      // CORECTARE CRITICĂ: Salvează imaginea pentru verificare
      const { error: verificationError } = await supabase
        .from('pending_verifications')
        .insert([
          { 
            user_id: user.id, 
            image_data: image_data,
            status: 'pending'
          }
        ]);

      if (verificationError) {
        console.error('Eroare la salvarea verificării:', verificationError);
        // Șterge utilizatorul creat dacă nu putem salva verificarea
        await supabase
          .from('users')
          .delete()
          .eq('id', user.id);
          
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Eroare la salvarea imaginii' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Înregistrare reușită! Așteptați verificarea manuală de către administrator.',
          userId: user.id.toString()
        })
      };

    } catch (error) {
      console.error('Eroare verificare:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Eroare internă server. Vă rugăm încercați mai târziu.' })
      };
    }
  }

  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};