let verifiedUsers = new Map();
let userVotes = new Set();

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type', 
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      const { user_id } = event.queryStringParameters || {};

      if (!user_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            authenticated: false,
            error: "User ID este obligatoriu"
          })
        };
      }

      const user = verifiedUsers.get(user_id);
      if (!user) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            authenticated: false,
            has_voted: false
          })
        };
      }

      const hasVoted = userVotes.has(user_id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          authenticated: true,
          has_voted: hasVoted,
          user_name: user.nume,
          user_email: user.email
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };

  } catch (error) {
    console.error('Eroare la verificare status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Eroare internă la procesare" 
      })
    };
  }
};