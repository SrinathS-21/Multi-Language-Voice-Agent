'use client';

import { useEffect, useState } from 'react';

export default function DebugPage() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        console.log('Fetching agents from API...');
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';
        const response = await fetch(`${API_BASE_URL}/api/v1/agents?tenant_id=${ORG_ID}`);
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        setResult(data);
      } catch (err) {
        console.error('Error:', err);
        setError((err as Error).message);
      }
    };

    fetchAgents();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>API Debug Page</h1>
      <h2>Agents from API:</h2>
      <pre>{JSON.stringify(result, null, 2)}</pre>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
    </div>
  );
}
