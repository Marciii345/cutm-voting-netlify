const { v4: uuidv4 } = require('uuid');

// Simulăm o bază de date în memorie (în producție folosești Firebase sau alt serviciu)
let verifiedUsers = new Map();
let carnetHashes = new Set();

exports.handler = async function(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { email, password, image_data } = body;

      // Validare de bază
      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Email și parolă sunt obligatorii"
          })
        };
      }

      if (password.length < 6) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Parola trebuie să aibă minim 6 caractere"
          })
        };
      }

      // Simulăm verificarea carnetului (în producție ai folosi OCR aici)
      // Pentru demo, considerăm că orice imagine este validă
      const carnetHash = generateCarnetHash(image_data);
      
      if (carnetHashes.has(carnetHash)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Acest carnet a fost deja înregistrat"
          })
        };
      }

      // Extragem date simulate din "carnet"
      const studentData = extractStudentData(image_data);
      
      // Generăm ID utilizator
      const userId = uuidv4();
      
      // Salvăm utilizatorul
      const userData = {
        userId,
        email,
        nume: studentData.nume,
        numar_carnet: studentData.numar_carnet,
        gen: studentData.gen,
        carnetHash,
        data_inregistrare: new Date().toISOString(),
        a_votat: false
      };

      verifiedUsers.set(userId, userData);
      carnetHashes.add(carnetHash);

      console.log(`✅ Utilizator înregistrat: ${email}`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: "Carnet verificat cu succes!",
          user_data: {
            nume: studentData.nume,
            email: email,
            numar_carnet: studentData.numar_carnet,
            gen: studentData.gen
          },
          user_id: userId,
          redirect: "/vot.html"
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };

  } catch (error) {
    console.error('Eroare la verificare:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: "Eroare internă la procesare" 
      })
    };
  }
};

// Funcții helper
function generateCarnetHash(imageData) {
  // Simplificat pentru demo
  return Buffer.from(imageData).toString('base64').substring(0, 32) + Date.now();
}

function extractStudentData(imageData) {
  // În producție, ai folosi OCR aici
  // Pentru demo, returnăm date simulate
  return {
    nume: "Elev UTM",
    numar_carnet: "UTM" + Math.random().toString(36).substr(2, 5).toUpperCase(),
    gen: Math.random() > 0.5 ? "M" : "F"
  };
}