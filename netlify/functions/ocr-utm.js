// netlify/functions/ocr-utm.js
const tesseract = require('tesseract.js');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

// MODEL ANTREANT PENTRU CARNETE UTM
const UTM_PATTERNS = {
  institution: ['UTM', 'UNIVERSITATEA TEHNICĂ', 'UNIVERSITATEA TEHNICA', 'COLEGIUL UTM'],
  document: ['CARNET DE ELEV', 'CARNET ELEV', 'CARNET'],
  ministry: ['MINISTERUL EDUCAȚIEI', 'MINISTERUL EDUCATIEI', 'MINISTERUL'],
  validity: ['VALABIL', 'VIZE', 'SEPTEMBRIE', 'IUNIE'],
  numbers: ['NR.', 'NUMAR', 'NR']
};

// =============================================
// PREPROCESARE AVANSATĂ PENTRU CARNETE
// =============================================

async function advancedPreprocessing(imageData) {
  try {
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    let image = await Jimp.read(buffer);
    
    console.log('🔄 Preprocesare avansată...');
    
    // SERIE DE PREPROCESĂRI PENTRU CARNETE
    image = await image
      .greyscale()                    // 1. Alb-negru
      .contrast(0.7)                  // 2. Contrast ridicat
      .normalize()                    // 3. Normalizare
      .brightness(0.1)                // 4. Luminozitate
      .posterize(6)                   // 5. Reducere culori
      .dither565()                    // 6. Dithering
      .gaussian(1)                    // 7. Gaussian blur ușor
      .convolution([                   // 8. Sharpening
        [-1, -1, -1],
        [-1, 9, -1],
        [-1, -1, -1]
      ]);
    
    // 9. SCALARE OPTIMĂ PENTRU OCR
    const { width, height } = image.bitmap;
    if (width > 1200 || height > 1200) {
      image = image.scaleToFit(1200, 1200);
    } else if (width < 600 || height < 600) {
      image = image.scaleToFit(800, 800);
    }
    
    console.log('✅ Preprocesare completă');
    return await image.getBufferAsync(Jimp.MIME_JPEG);
    
  } catch (error) {
    console.error('Eroare preprocesare:', error);
    // Fallback la imaginea originală
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }
}

// =============================================
// VALIDARE SPECIALIZATĂ UTM
// =============================================

function validateUTMCarnet(text, expectedCarnet) {
  if (!text || !expectedCarnet) {
    return {
      isValid: false,
      confidence: 0,
      scores: {},
      missing: ['no_text_or_carnet']
    };
  }

  const upperText = text.toUpperCase();
  const upperCarnet = expectedCarnet.toUpperCase();
  
  console.log('🎯 Validare specifică UTM...');
  
  // SCORARE DETALIATĂ
  const scores = {
    hasUTM: checkPattern(upperText, UTM_PATTERNS.institution) ? 25 : 0,
    hasCarnetText: checkPattern(upperText, UTM_PATTERNS.document) ? 20 : 0,
    hasMinistry: checkPattern(upperText, UTM_PATTERNS.ministry) ? 15 : 0,
    hasValidity: checkPattern(upperText, UTM_PATTERNS.validity) ? 10 : 0,
    hasNumberPrefix: checkPattern(upperText, UTM_PATTERNS.numbers) ? 10 : 0,
    hasCarnetNumber: findCarnetNumber(upperText, upperCarnet) ? 20 : 0
  };
  
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = Math.min(100, totalScore);
  
  const isValid = confidence >= 40; // Prag scăzut pentru început
  
  console.log('📊 Scor validare:', scores, 'Total:', totalScore);
  
  return {
    isValid,
    confidence,
    scores,
    missing: Object.entries(scores)
      .filter(([_, score]) => score === 0)
      .map(([key]) => key)
  };
}

function checkPattern(text, patterns) {
  return patterns.some(pattern => text.includes(pattern));
}

function findCarnetNumber(text, expectedCarnet) {
  if (!text || !expectedCarnet) return false;
  
  // Verificări multiple pentru număr carnet
  const checks = [
    text.includes(expectedCarnet),
    text.includes(`NR.${expectedCarnet}`),
    text.includes(`NR. ${expectedCarnet}`),
    text.includes(`NUMAR ${expectedCarnet}`),
    // Corecții OCR
    text.includes(expectedCarnet.replace(/O/g, '0')),
    text.includes(expectedCarnet.replace(/0/g, 'O')),
    text.includes(expectedCarnet.replace(/I/g, '1')),
    text.includes(expectedCarnet.replace(/1/g, 'I')),
    text.includes(expectedCarnet.replace(/S/g, '5')),
    text.includes(expectedCarnet.replace(/5/g, 'S'))
  ];
  
  return checks.some(check => check);
}

// =============================================
// SISTEM DE ANTRENAMENT AUTOMAT
// =============================================

async function saveTrainingData(imageData, extractedText, confidence) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const trainingDir = '/tmp/training_data';
    
    // Creează director dacă nu există
    if (!fs.existsSync(trainingDir)) {
      fs.mkdirSync(trainingDir, { recursive: true });
    }
    
    // Salvează imaginea
    const imagePath = path.join(trainingDir, `carnet_${timestamp}.jpg`);
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    fs.writeFileSync(imagePath, base64Data, 'base64');
    
    // Salvează textul extras
    const textPath = path.join(trainingDir, `carnet_${timestamp}.txt`);
    fs.writeFileSync(textPath, `CONFIDENCE: ${confidence}\n\n${extractedText}`);
    
    console.log('💾 Date salvate pentru antrenament:', timestamp);
    
  } catch (error) {
    console.log('⚠️ Nu s-au putut salva date antrenament:', error.message);
  }
}

// =============================================
// FUNCȚIA PRINCIPALĂ (HANDLER)
// =============================================

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: 'Metodă nepermisă' }) 
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { image_data, expected_carnet } = body;
    
    if (!image_data) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Lipseste image_data' 
        })
      };
    }
    
    console.log('🔍 OCR UTM PROPRIU - Procesare...');
    
    // 1. PREPROCESARE AVANSATĂ
    const processedImage = await advancedPreprocessing(image_data);
    
    // 2. OCR CU SETĂRI OPTIMIZATE PENTRU CARNETE
    const result = await tesseract.recognize(processedImage, 'ron+eng', {
      logger: m => console.log(m),
      tessedit_pageseg_mode: '6',
      tessedit_ocr_engine_mode: '1',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZĂÂÎȘȚĂÂÎȘȚabcdefghijklmnopqrstuvwxyzăâîșțăâîșț0123456789 -.,/',
      preserve_interword_spaces: '1',
      textord_min_linesize: '2.5'
    });
    
    const extractedText = result.data.text;
    console.log('📖 TEXT EXTRAS:', extractedText.substring(0, 200));
    
    // 3. VALIDARE SPECIALIZATĂ PENTRU UTM
    const validation = validateUTMCarnet(extractedText, expected_carnet || '');
    
    // 4. SALVARE PENTRU ANTRENAMENT (dacă e valid)
    if (validation.isValid && validation.confidence > 50) {
      await saveTrainingData(image_data, extractedText, validation.confidence);
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: extractedText,
        confidence: result.data.confidence,
        validation: validation,
        utm_detected: validation.isValid,
        processed: true
      })
    };
    
  } catch (error) {
    console.error('❌ Eroare OCR UTM:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        text: '',
        confidence: 0,
        error: 'OCR propriu eșuat: ' + error.message,
        processed: false
      })
    };
  }
};