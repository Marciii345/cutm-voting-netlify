// netlify/functions/report-issue.js
const supabase = require('./database');

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
      const { email, nume, phone, numar_carnet, clasa, issue_type, description } = JSON.parse(event.body);

      // Validări de bază
      if (!email || !nume || !phone || !issue_type || !description) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Toate câmpurile obligatorii trebuie completate' })
        };
      }

      // Validare email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Adresa de email nu este validă' })
        };
      }

      // Validare telefon (format românesc)
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Numărul de telefon trebuie să aibă 10 cifre' })
        };
      }

      // Salvează problema tehnică
      const { error } = await supabase
        .from('technical_issues')
        .insert([
          {
            email: email,
            nume: nume,
            phone: phone,
            numar_carnet: numar_carnet || null,
            clasa: clasa || null,
            issue_type: issue_type,
            description: description,
            status: 'open'
          }
        ]);

      if (error) {
        console.error('Eroare la salvarea problemei:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Eroare la salvarea raportului' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Raportul tău a fost trimis cu succes! Vom reveni cu un răspons în cel mai scurt timp.'
        })
      };

    } catch (error) {
      console.error('Eroare raportare problemă:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Eroare internă server. Vă rugăm încercați mai târziu.' })
      };
    }
  }

  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};