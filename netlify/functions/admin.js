// netlify/functions/admin.js - ACTUALIZAT
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
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acces restricționat' }) };
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
          .from('verified_carnets')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        const { count: autoVerified } = await supabase
          .from('verified_carnets')
          .select('*', { count: 'exact', head: true })
          .eq('auto_verified', true)
          .eq('status', 'approved');

        const { count: openIssues } = await supabase
          .from('technical_issues')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open');

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
              autoVerified,
              openIssues,
              participationRate
            }
          })
        };
      }

      // Carnete în așteptare (NOU)
      if (action === 'pending_carnets') {
        const { data: pendingCarnets, error } = await supabase
          .from('verified_carnets')
          .select(`
            *,
            users (
              email,
              nume,
              numar_carnet,
              clasa,
              is_verified
            )
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la preluare date' }) };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ pendingCarnets })
        };
      }

      // Toate carnetele verificate
      if (action === 'all_carnets') {
        const { data: allCarnets, error } = await supabase
          .from('verified_carnets')
          .select(`
            *,
            users (
              email,
              nume,
              numar_carnet,
              clasa,
              is_verified
            )
          `)
          .order('created_at', { ascending: false });

        if (error) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la preluare date' }) };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ allCarnets })
        };
      }

      // Probleme tehnice
      if (action === 'technical_issues') {
        const { data: issues, error } = await supabase
          .from('technical_issues')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la preluare probleme' }) };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ issues })
        };
      }

      // Utilizatori
      if (action === 'all_users') {
        const { data: users, error } = await supabase
          .from('users')
          .select('id, email, nume, numar_carnet, clasa, is_verified, is_admin, created_at')
          .order('created_at', { ascending: false });

        if (error) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la preluare utilizatori' }) };
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
      const body = JSON.parse(event.body);
      const { action, carnetId, userId, issueId, resolve, approve, reason } = body;

      // Verificare manuală carnet (NOU)
      if (action === 'verify_carnet') {
        const { error: carnetError } = await supabase
          .from('verified_carnets')
          .update({ 
            status: approve ? 'approved' : 'rejected',
            verified_at: approve ? new Date().toISOString() : null,
            admin_notes: reason || (approve ? 'Aprobat manual de administrator' : 'Respins manual de administrator'),
            auto_verified: false
          })
          .eq('id', carnetId);

        if (carnetError) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la verificare carnet' }) };
        }

        // Actualizează utilizatorul
        const { error: userError } = await supabase
          .from('users')
          .update({ is_verified: approve })
          .eq('id', userId);

        if (userError) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la actualizare utilizator' }) };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: approve ? 'Carnet aprobat cu succes!' : 'Carnet respins!' 
          })
        };
      }

      // Cerere retransmisie (NOU)
      if (action === 'request_resubmission') {
        const { error: carnetError } = await supabase
          .from('verified_carnets')
          .update({ 
            status: 'rejected',
            admin_notes: `Cerere retransmisie: ${reason}`
          })
          .eq('id', carnetId);

        if (carnetError) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la cerere retransmisie' }) };
        }

        const { error: userError } = await supabase
          .from('users')
          .update({ is_verified: false })
          .eq('id', userId);

        if (userError) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la actualizare utilizator' }) };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Cererea de retransmisie a fost trimisă!' 
          })
        };
      }

      // Deconectare carnet
      if (action === 'disconnect_carnet') {
        const { error: carnetError } = await supabase
          .from('verified_carnets')
          .update({ 
            status: 'rejected',
            admin_notes: 'Deconectat de administrator'
          })
          .eq('id', carnetId);

        if (carnetError) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la deconectare' }) };
        }

        const { error: userError } = await supabase
          .from('users')
          .update({ is_verified: false })
          .eq('id', userId);

        if (userError) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la dezactivare utilizator' }) };
        }

        await supabase
          .from('votes')
          .delete()
          .eq('user_id', userId);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Carnet deconectat și utilizator dezactivat!' 
          })
        };
      }

      // Gestionare probleme tehnice
      if (action === 'handle_issue') {
        if (resolve) {
          const { error } = await supabase
            .from('technical_issues')
            .update({ 
              status: 'resolved',
              resolved_at: new Date().toISOString()
            })
            .eq('id', issueId);

          if (error) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la rezolvare problemă' }) };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              success: true, 
              message: 'Problemă marcată ca rezolvată!' 
            })
          };
        } else {
          const { error } = await supabase
            .from('technical_issues')
            .delete()
            .eq('id', issueId);

          if (error) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la ștergere problemă' }) };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              success: true, 
              message: 'Problemă ștearsă!' 
            })
          };
        }
      }

      // Reset voturi
      if (action === 'reset_votes') {
        const { error } = await supabase
          .from('votes')
          .delete()
          .neq('id', 0);

        if (error) {
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la resetare voturi' }) };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Toate voturile au fost resetate!' 
          })
        };
      }

      // Export date
      if (action === 'export_data') {
        const { data: votes, error } = await supabase
          .from('votes')
          .select(`
            president,
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
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Eroare la export date' }) };
        }

        const formattedVotes = votes.map(vote => ({
          nume: vote.users.nume,
          email: vote.users.email,
          numar_carnet: vote.users.numar_carnet,
          clasa: vote.users.clasa,
          president: vote.president,
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