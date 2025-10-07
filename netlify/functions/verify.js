// netlify/functions/verify.js
const supabase = require('./database');
const bcrypt = require('bcryptjs');
const Tesseract = require('tesseract.js');
const crypto = require('crypto');

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

      // Validări de bază
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

      // Verifică dacă email-ul există deja
      const { data: existingEmail, error: emailError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingEmail) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Email-ul există deja în sistem' })
        };
      }

      // Generează hash pentru imagine
      const imageHash = crypto.createHash('md5').update(image_data).digest('hex');

      // Verifică dacă imaginea a mai fost folosită
      const { data: existingImage, error: imageError } = await supabase
        .from('verified_carnets')
        .select('id, numar_carnet, user_id')
        .eq('image_hash', imageHash)
        .single();

      if (existingImage) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Această imagine a carnetului a mai fost folosită' })
        };
      }

      // Verifică dacă numărul carnetului a mai fost folosit
      const { data: existingCarnet, error: carnetError } = await supabase
        .from('verified_carnets')
        .select('id, user_id, status')
        .eq('numar_carnet', numar_carnet)
        .single();

      if (existingCarnet) {
        if (existingCarnet.status === 'approved') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Numărul carnetului a mai fost folosit' })
          };
        } else if (existingCarnet.status === 'pending') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Această cerere este deja în procesare' })
          };
        }
      }

      // Procesează imaginea cu OCR pentru carnet UTM
      const ocrResult = await processCarnetImage(image_data, numar_carnet);
      
      let autoVerified = false;
      let verificationStatus = 'pending';
      let adminNotes = '';

      if (ocrResult.isValid) {
        autoVerified = true;
        verificationStatus = 'approved';
        adminNotes = 'Verificat automat prin OCR - Carnet UTM valid';
      } else {
        verificationStatus = 'pending';
        adminNotes = `Necesită verificare manuală: ${ocrResult.reason}`;
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
            is_verified: autoVerified
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

      // Salvează carnetul verificat
      const { error: carnetSaveError } = await supabase
        .from('verified_carnets')
        .insert([
          {
            numar_carnet: numar_carnet,
            user_id: user.id,
            image_hash: imageHash,
            image_data: image_data,
            status: verificationStatus,
            auto_verified: autoVerified,
            verification_data: ocrResult,
            admin_notes: adminNotes,
            verified_at: autoVerified ? new Date().toISOString() : null
          }
        ]);

      if (carnetSaveError) {
        console.error('Eroare la salvarea carnetului:', carnetSaveError);
        // Șterge utilizatorul creat
        await supabase.from('users').delete().eq('id', user.id);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Eroare la salvarea datelor carnetului' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: autoVerified 
            ? 'Înregistrare reușită! Contul a fost verificat automat.' 
            : 'Înregistrare reușită! Așteptați verificarea manuală de către administrator.',
          userId: user.id.toString(),
          is_verified: autoVerified,
          auto_verified: autoVerified
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

async function processCarnetImage(imageData, expectedCarnetNumber) {
  try {
    // Elimină prefixul base64
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    // Folosim Tesseract pentru OCR cu limba română
    const { data: { text } } = await Tesseract.recognize(buffer, 'ron', {
      logger: m => console.log(m)
    });

    console.log('Text extras din imagine:', text);

    // Verificări specifice pentru carnetul UTM
    const checks = {
      hasMinisterul: /MINISTERUL EDUCAȚIEI/i.test(text),
      hasUniversitatea: /UNIVERSITATEA TEHNICĂ/i.test(text),
      hasColegiul: /Colegiul Universității Tehnice a Moldovei/i.test(text),
      hasCarnetDeElev: /CARNET DE ELEV/i.test(text),
      hasNr: /Nr\./i.test(text),
      hasCarnetNumber: new RegExp(expectedCarnetNumber, 'i').test(text),
      hasValabil: /Valabil până la/i.test(text),
      hasUTM: /UTM/i.test(text)
    };

    // Calculăm scorul de validare
    const totalChecks = Object.keys(checks).length;
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const validationScore = (passedChecks / totalChecks) * 100;

    console.log('Scor validare:', validationScore);
    console.log('Verificări:', checks);

    // Decizie bazată pe scor - threshold mai scăzut pentru a prinde mai multe variații
    if (validationScore >= 70) {
      return {
        isValid: true,
        score: validationScore,
        checks: checks,
        extractedText: text,
        reason: 'Carnet UTM valid detectat'
      };
    } else {
      const failedChecks = Object.keys(checks).filter(key => !checks[key]);
      return {
        isValid: false,
        score: validationScore,
        checks: checks,
        extractedText: text,
        reason: `Scor insuficient: ${validationScore.toFixed(1)}%. Verificări eșuate: ${failedChecks.join(', ')}`
      };
    }

  } catch (error) {
    console.error('Eroare procesare OCR:', error);
    return {
      isValid: false,
      score: 0,
      checks: {},
      extractedText: '',
      reason: 'Eroare la procesarea imaginii'
    };
  }
}