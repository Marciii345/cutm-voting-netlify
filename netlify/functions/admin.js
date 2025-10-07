// netlify/functions/admin.js
const supabase = require('./database');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Verificare admin
  const token = event.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token required' }) };
  }

  try {
    const { verify } = require('jsonwebtoken');
    const user = verify(token, process.env.JWT_SECRET);

    if (!user.isAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acces restricționat. Doar administratorii pot accesa această resursă.' }) };
    }

    // GET - Statistici și date
    if (event.httpMethod === 'GET') {
      const { action } = event.queryStringParameters || {};

      // Statistici generale
      if (action === 'stats') {
        const { count: totalUsers } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });

        const { count: verifiedUsers } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('is_verified', true);

        const { count: totalVotes } = await supabase
          .from('votes')
          .select('*', { count: 'exact', head: true });

        const { count: pendingVerifications } = await supabase
          .from('pending_verifications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        const participationRate = verifiedUsers > 0 
          ? ((totalVotes / verifiedUsers) * 100).toFixed(1) 
          : 0;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            stats: {
              totalUsers,
              verifiedUsers,
              totalVotes,
              pendingVerifications,
              participationRate
            }
          })
        };
      }

      // Utilizatori în așteptare - CORECTAT
      if (action === 'pending_users') {
        // Mai întâi obținem toate verificările în așteptare
        const { data: pendingVerifications, error } = await supabase
          .from('pending_verifications')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Eroare la preluarea verificărilor:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Eroare la preluarea datelor' })
          };
        }

        // Dacă nu există verificări, returnăm un array gol
        if (pendingVerifications.length === 0) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ pendingUsers: [] })
          };
        }

        // Obținem toți userii corespunzători
        const userIds = pendingVerifications.map(pv => pv.user_id);
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('*')
          .in('id', userIds);

        if (usersError) {
          console.error('Eroare la preluarea utilizatorilor:', usersError);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Eroare la preluarea utilizatorilor' })
          };
        }

        // Combinăm datele
        const formattedUsers = pendingVerifications.map(pv => {
          const user = users.find(u => u.id === pv.user_id);
          if (!user) {
            return null;
          }
          return {
            id: user.id,
            verification_id: pv.id,
            email: user.email,
            nume: user.nume,
            numar_carnet: user.numar_carnet,
            clasa: user.clasa,
            image_data: pv.image_data,
            status: pv.status,
            created_at: pv.created_at
          };
        }).filter(Boolean); // Elimină orice element null

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ pendingUsers: formattedUsers })
        };
      }

      // Toți utilizatorii
      if (action === 'all_users') {
        const { data: users, error } = await supabase
          .from('users')
          .select('id, email, nume, numar_carnet, clasa, is_verified, created_at')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Eroare la preluarea utilizatorilor:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Eroare la preluarea datelor' })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ users })
        };
      }
    }

    // POST - Acțiuni admin
    if (event.httpMethod === 'POST') {
      const { action, userId, verificationId, approve, reason } = JSON.parse(event.body);

      // Verificare utilizator
      if (action === 'verify_user') {
        if (approve) {
          // Actualizează utilizatorul ca verificat
          const { error: userError } = await supabase
            .from('users')
            .update({ is_verified: true })
            .eq('id', userId);

          if (userError) {
            console.error('Eroare la aprobare utilizator:', userError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: 'Eroare la aprobare utilizator' })
            };
          }

          // Actualizează statusul verificării
          const { error: verificationError } = await supabase
            .from('pending_verifications')
            .update({ status: 'approved' })
            .eq('id', verificationId);

          if (verificationError) {
            console.error('Eroare la actualizarea verificării:', verificationError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: 'Eroare la actualizarea verificării' })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              success: true, 
              message: 'Utilizator aprobat cu succes!' 
            })
          };
        } else {
          // Respinge utilizator - șterge din ambele tabele
          const { error: deleteUserError } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

          if (deleteUserError) {
            console.error('Eroare la ștergerea utilizatorului:', deleteUserError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: 'Eroare la respingere utilizator' })
            };
          }

          // Șterge și din pending_verifications
          await supabase
            .from('pending_verifications')
            .delete()
            .eq('id', verificationId);

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              success: true, 
              message: 'Utilizator respins și șters din sistem.' 
            })
          };
        }
      }

      // Cerere retransmisie imagine
      if (action === 'request_resubmission') {
        const { error: updateError } = await supabase
          .from('pending_verifications')
          .update({ 
            status: 'needs_resubmission',
            admin_notes: reason || 'Imagine neclară sau incompletă. Vă rugăm reîncarcați o imagine clară a carnetului.'
          })
          .eq('id', verificationId);

        if (updateError) {
          console.error('Eroare la cererea de retransmisie:', updateError);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Eroare la cererea de retransmisie' })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Cerere de retransmisie trimisă utilizatorului.' 
          })
        };
      }

      // Reset voturi
      if (action === 'reset_votes') {
        const { error } = await supabase
          .from('votes')
          .delete()
          .neq('id', 0);

        if (error) {
          console.error('Eroare la resetarea voturilor:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Eroare la resetarea voturilor' })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Toate voturile au fost resetate cu succes!' 
          })
        };
      }

      // Export date
      if (action === 'export_data') {
        const { data: votes, error } = await supabase
          .from('votes')
          .select(`
            president,
            vice_president,
            culture_minister,
            administration_minister,
            social_media_minister,
            created_at,
            users (
              email,
              nume,
              numar_carnet,
              clasa
            )
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Eroare la exportul datelor:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Eroare la exportul datelor' })
          };
        }

        const formattedVotes = votes.map(vote => ({
          ...vote.users,
          president: vote.president,
          vice_president: vote.vice_president,
          culture_minister: vote.culture_minister,
          administration_minister: vote.administration_minister,
          social_media_minister: vote.social_media_minister,
          created_at: vote.created_at
        }));

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            votes: formattedVotes,
            exportDate: new Date().toISOString()
          })
        };
      }
    }

    return { statusCode: 405, headers, body: 'Method Not Allowed' };

  } catch (error) {
    console.error('Eroare admin:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token invalid' }) };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Eroare internă server' })
    };
  }
};