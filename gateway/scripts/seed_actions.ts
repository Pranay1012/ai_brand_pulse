import pool from '../src/db';

async function seed() {
  await pool.query(`
    INSERT INTO actions (cluster_id, brand_id, action_type, status, payload, rationale)
    VALUES 
    (
      '4caa9764-488c-4142-975c-b46acd130fe6',
      'af15c9e7-1ffd-4b31-ba27-d7cdd7de5715',
      'jira_ticket',
      'pending',
      $1,
      'Cluster crossed negative sentiment ratio threshold with multiple complaints'
    ),
    (
      '6e19f99d-e7b8-4dc4-9c56-d1d1de259098',
      'af15c9e7-1ffd-4b31-ba27-d7cdd7de5715',
      'pr_response',
      'pending',
      $2,
      'Community sentiment trend requires proactive communications'
    )
  `, [
    JSON.stringify({ summary: 'Investigate latency regression reported across user mentions', issue_type: 'Bug', priority: 'High', description: 'Repeated negative sentiment regarding performance.' }),
    JSON.stringify({ summary: 'Prepare PR response addressing public discussions', issue_type: 'Task', priority: 'Medium', description: 'Draft FAQ and clarification response for community discussions.' })
  ]);
  console.log('Seeded 2 pending actions successfully');
  await pool.end();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
