// netlify/functions/verify.js - SISTEM ULTIMAT CU OCR PROPRIU
const supabase = require('./database');
const crypto = require('crypto');

exports.handler = async (event) => {
  console.log('=== SISTEM VERIFICARE CU OCR PROPRIU ===');
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return sendSuccessResponse(false, 'Metoda nepermisă. Folosește butonul de trimitere.', 'method_not_allowed');
  }

  try {
    console.log('📥 Primire date...');
    
    if (!event.body) {
      return sendSuccessResponse(false, 'Datele trimise sunt goale. Completează formularul și încearcă din nou.', 'empty_body');
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (parseError) {
      return sendSuccessResponse(false, 'Format date invalid. Reîncarcă pagina și încearcă din nou.', 'invalid_json');
    }

    const { email, nume, numar_carnet, clasa, image_data, retry_count = 0 } = body;
    
    if (!email || !image_data || !nume || !numar_carnet || !clasa) {
      return sendSuccessResponse(false, 'Toate câmpurile sunt obligatorii. Completează toate detaliile.', 'missing_fields');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedNume = nume.trim();
    const normalizedCarnet = numar_carnet.toString().trim().toUpperCase();
    const normalizedClasa = clasa.trim().toUpperCase();
    const currentRetry = parseInt(retry_count) || 0;

    console.log('👤 Înregistrare pentru:', normalizedEmail, '| Încercarea:', currentRetry);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return sendSuccessResponse(false, 'Adresa de email nu este validă. Verifică și încearcă din nou.', 'invalid_email', currentRetry);
    }

    const nameRegex = /^[A-Za-zĂÂÎȘȚăâîșț\s\-]+$/;
    if (!nameRegex.test(normalizedNume)) {
      return sendSuccessResponse(false, 'Numele conține caractere invalide. Folosește doar litere și spații.', 'invalid_name', currentRetry);
    }

    const carnetRegex = /^[A-Z0-9]{3,6}$/;
    if (!carnetRegex.test(normalizedCarnet)) {
      return sendSuccessResponse(false, 'Numărul carnetului trebuie să aibă 3-6 caractere (cifre sau litere).', 'invalid_carnet', currentRetry);
    }

    console.log('🖼️ Validare imagine...');
    const imageCheck = await validateImageBasic(image_data);
    if (!imageCheck.isValid) {
      return sendSuccessResponse(false, imageCheck.message, imageCheck.issueType, currentRetry, true);
    }

    console.log('🔍 Verificări duplicate...');
    const duplicateCheck = await checkForDuplicates(normalizedEmail, normalizedCarnet, image_data);
    if (!duplicateCheck.isValid) {
      return sendSuccessResponse(false, duplicateCheck.message, 'duplicate', currentRetry, false);
    }

    console.log('🚀 Procesare cu OCR PROPRIU...');
    const ocrResult = await processImageWithOCRPropriu(image_data, normalizedNume, normalizedCarnet, normalizedClasa, currentRetry);
    
    if (!ocrResult.isValid) {
      return sendSuccessResponse(false, ocrResult.message, ocrResult.issueType, currentRetry + 1, true, ocrResult.suggestion);
    }

    console.log('✅ Carnet valid - creare cont...');
    const userResult = await createUserAndCarnet(normalizedEmail, normalizedNume, normalizedCarnet, normalizedClasa, image_data, ocrResult);
    
    console.log('🎉 Înregistrare reușită pentru:', normalizedEmail);
    
    return sendSuccessResponse(true, '🎉 Fantastic! Înregistrare reușită! Acum poți vota.', 'approved', currentRetry, false, '', {
      token: userResult.token,
      userId: userResult.user.id,
      user: userResult.user,
      ocr_score: ocrResult.score,
      auto_verified: ocrResult.auto_verified
    });

  } catch (error) {
    console.error('💥 EROARE GRAVĂ:', error);
    return sendSuccessResponse(false, 'A apărut o problemă temporară. Încearcă din nou în câteva minute.', 'server_error', 0, true);
  }
};

// =============================================
// FUNCȚII AUXILIARE ÎMBUNĂTĂȚITE
// =============================================

function sendSuccessResponse(success, message, issueType = '', retryCount = 0, needsRetry = false, suggestion = '', extraData = {}) {
  const response = {
    success,
    message,
    issue_type: issueType,
    retry_count: retryCount,
    needs_retry: needsRetry,
    ...extraData
  };

  if (suggestion) {
    response.suggestion = suggestion;
  }

  console.log(`📤 Răspuns: ${success ? 'SUCCES' : 'EROARE'} - ${message}`);

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(response)
  };
}

async function validateImageBasic(imageData) {
  try {
    if (!imageData || typeof imageData !== 'string') {
      return {
        isValid: false,
        message: 'Imaginea nu este validă. Încarcă o poză reală a carnetului.',
        issueType: 'invalid_image'
      };
    }

    if (!imageData.startsWith('data:image/')) {
      return {
        isValid: false,
        message: 'Format imagine invalid. Folosește formate JPG, PNG sau WEBP.',
        issueType: 'invalid_format'
      };
    }

    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const fileSize = Math.floor((base64Data.length * 3) / 4);
    
    if (fileSize < 10000) {
      return {
        isValid: false,
        message: '📸 Imaginea este prea mică sau coruptă. Fă o poză mai clară și mai mare.',
        issueType: 'image_too_small'
      };
    }
    
    if (fileSize > 5 * 1024 * 1024) {
      return {
        isValid: false,
        message: '📱 Imaginea este prea mare (maxim 5MB). Redimensionează imaginea.',
        issueType: 'image_too_large'
      };
    }

    return { isValid: true };

  } catch (error) {
    return {
      isValid: false,
      message: 'Eroare la validarea imaginii. Încearcă cu o altă poză.',
      issueType: 'image_validation_error'
    };
  }
}

async function checkForDuplicates(email, carnetNumber, imageData) {
  try {
    const imageHash = crypto.createHash('md5').update(imageData).digest('hex');

    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingEmail) {
      return {
        isValid: false,
        message: '✋ Există deja un cont cu acest email. Dacă ai uitat datele, contactează-ne.'
      };
    }

    const { data: existingCarnet } = await supabase
      .from('verified_carnets')
      .select('id, status')
      .eq('numar_carnet', carnetNumber)
      .single();

    if (existingCarnet) {
      if (existingCarnet.status === 'approved') {
        return {
          isValid: false,
          message: '❌ Acest număr de carnet a fost deja folosit. Un carnet = un singur vot.'
        };
      }
      return {
        isValid: false,
        message: '⏳ Acest carnet este deja în proces de verificare.'
      };
    }

    const { data: existingImage } = await supabase
      .from('verified_carnets')
      .select('id')
      .eq('image_hash', imageHash)
      .single();

    if (existingImage) {
      return {
        isValid: false,
        message: '🖼️ Această poză a carnetului a mai fost folosită. Folosește o poză originală.'
      };
    }

    return { isValid: true };

  } catch (error) {
    console.error('Eroare verificări duplicate:', error);
    return {
      isValid: false,
      message: 'Eroare la verificarea datelor. Încearcă din nou.'
    };
  }
}

// =============================================
// OCR PROPRIU - FUNCȚIA PRINCIPALĂ
// =============================================

async function processImageWithOCRPropriu(imageData, expectedName, expectedCarnet, expectedClass, retryCount) {
  console.log('🚀 FOLOSIM OCR PROPRIU UTM!');
  
  try {
    const response = await fetch('http://localhost:8888/.netlify/functions/ocr-utm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        image_data: imageData,
        expected_carnet: expectedCarnet 
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.text && data.validation.isValid) {
      console.log('✅ OCR PROPRIU A REUȘIT! Scor:', data.validation.confidence);
      
      return {
        isValid: true,
        score: data.validation.confidence,
        message: 'Carnet verificat cu succes!',
        auto_verified: data.validation.confidence > 60,
        extractedText: data.text
      };
    } else {
      console.log('❌ OCR propriu insuficient:', data.validation);
      
      // FALLBACK: Acceptă pentru verificare manuală chiar dacă OCR eșuează parțial
      if (data.text && data.text.length > 20) {
        console.log('🔄 OCR parțial reușit - acceptăm pentru verificare manuală');
        return {
          isValid: true,
          score: data.validation.confidence || 30,
          message: 'Carnet acceptat pentru verificare manuală',
          auto_verified: false,
          extractedText: data.text
        };
      }
      
      return {
        isValid: false,
        message: data.validation.missing ? `Lipsesc: ${data.validation.missing.join(', ')}` : 'Nu s-a putut verifica carnetul',
        issueType: 'ocr_failed',
        suggestion: 'Asigură-te că toate detaliile carnetului sunt vizibile și clare',
        score: data.validation.confidence || 0
      };
    }
  } catch (error) {
    console.error('💥 Eroare OCR propriu:', error);
    
    // FALLBACK ULTIM: acceptă pentru verificare manuală
    return {
      isValid: true,
      score: 25,
      message: 'Carnet acceptat (verificare manuală)',
      auto_verified: false,
      extractedText: 'EROARE OCR - VERIFICARE MANUALĂ'
    };
  }
}

// =============================================
// CREARE UTILIZATOR ȘI CARNET
// =============================================

async function createUserAndCarnet(email, nume, numar_carnet, clasa, imageData, ocrResult) {
  const imageHash = crypto.createHash('md5').update(imageData).digest('hex');
  
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([{ 
        email, 
        nume, 
        numar_carnet, 
        clasa, 
        is_verified: ocrResult.auto_verified || false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (userError) throw new Error(`Eroare utilizator: ${userError.message}`);

    const { error: carnetError } = await supabase
      .from('verified_carnets')
      .insert([{
        numar_carnet,
        user_id: user.id,
        image_hash: imageHash,
        image_data: imageData,
        status: ocrResult.auto_verified ? 'approved' : 'pending',
        auto_verified: ocrResult.auto_verified || false,
        verification_data: ocrResult,
        admin_notes: ocrResult.auto_verified 
          ? `Verificat automat - Scor: ${ocrResult.score}%` 
          : `Verificare manuală necesară - Scor: ${ocrResult.score}%`,
        verified_at: ocrResult.auto_verified ? new Date().toISOString() : null
      }]);

    if (carnetError) {
      await supabase.from('users').delete().eq('id', user.id);
      throw new Error(`Eroare carnet: ${carnetError.message}`);
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: user.id, email: user.email, isAdmin: false },
      process.env.JWT_SECRET || 'default-secret-key',
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        nume: user.nume,
        numar_carnet: user.numar_carnet,
        clasa: user.clasa
      }
    };

  } catch (error) {
    console.error('Eroare creare cont:', error);
    throw error;
  }
}