// Simulăm stocarea voturilor
let votes = new Map();
let userVotes = new Set();

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET'
  };

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
      const { user_id, vote_data } = body;

      if (!user_id || !vote_data) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "User ID și datele votului sunt obligatorii"
          })
        };
      }

      // Verifică dacă utilizatorul a votat deja
      if (userVotes.has(user_id)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Ați votat deja"
          })
        };
      }

      // Salvează votul
      const voteId = Date.now().toString();
      const voteRecord = {
        voteId,
        user_id,
        vote_data,
        timestamp: new Date().toISOString()
      };

      votes.set(voteId, voteRecord);
      userVotes.add(user_id);

      console.log(`✅ Vot înregistrat pentru user: ${user_id}`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: "Vot înregistrat cu succes!",
          vote_data: vote_data
        })
      };
    }

    // GET - pentru rezultate (doar pentru admin)
    if (event.httpMethod === 'GET') {
      const results = calculateResults();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          results: results
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };

  } catch (error) {
    console.error('Eroare la votare:', error);
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

function calculateResults() {
  const results = {
    president: {},
    vicePresident: {},
    cultureMinister: {},
    administrationMinister: {},
    socialMediaMinister: {}
  };

  // Numără voturile
  for (let [voteId, vote] of votes) {
    Object.entries(vote.vote_data).forEach(([position, candidate]) => {
      if (!results[position][candidate]) {
        results[position][candidate] = 0;
      }
      results[position][candidate]++;
    });
  }

  // Calculează procentele
  Object.keys(results).forEach(position => {
    const total = Object.values(results[position]).reduce((sum, count) => sum + count, 0);
    Object.keys(results[position]).forEach(candidate => {
      results[position][candidate] = {
        count: results[position][candidate],
        percentage: total > 0 ? ((results[position][candidate] / total) * 100).toFixed(1) : "0.0"
      };
    });
  });

  return results;
}