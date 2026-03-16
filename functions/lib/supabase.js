const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Initialize Supabase client if credentials are provided
let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

async function saveExample({ userId, agentId, runId, taskDescription, outputText, strategyId, primaryScore, embedding }) {
  if (!supabase) throw new Error("Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY.");
  
  const { data, error } = await supabase
    .from('agent_examples')
    .insert([{
      user_id: userId,
      agent_id: agentId,
      run_id: runId,
      task_description: taskDescription,
      output_text: outputText,
      strategy_id: strategyId,
      primary_score: primaryScore,
      embedding: embedding
    }])
    .select();
    
  if (error) throw error;
  return data;
}

async function matchExamples(embedding, agentId, count = 5) {
  if (!supabase) throw new Error("Supabase is not configured.");
  
  const { data, error } = await supabase.rpc('match_examples', {
    query_embedding: embedding,
    match_agent_id: agentId,
    match_count: count
  });
  
  if (error) throw error;
  
  return data.map(row => ({
    id: row.id,
    taskDescription: row.task_description,
    outputText: row.output_text,
    strategyId: row.strategy_id,
    primaryScore: row.primary_score,
    similarity: row.similarity
  }));
}

async function deleteExample(id) {
  if (!supabase) throw new Error("Supabase is not configured.");
  
  const { error } = await supabase
    .from('agent_examples')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}

async function getTopExamples(agentId, limit = 20) {
  if (!supabase) throw new Error("Supabase is not configured.");
  
  const { data, error } = await supabase
    .from('agent_examples')
    .select('id, task_description, output_text, strategy_id, primary_score')
    .eq('agent_id', agentId)
    .order('primary_score', { ascending: false })
    .limit(limit);
    
  if (error) throw error;
  
  return data.map(row => ({
    id: row.id,
    taskDescription: row.task_description,
    outputText: row.output_text,
    strategyId: row.strategy_id,
    primaryScore: row.primary_score
  }));
}

module.exports = {
  saveExample,
  matchExamples,
  deleteExample,
  getTopExamples
};
