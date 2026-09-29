import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ApolloProvider } from '@apollo/client/react';
import { client } from './lib/apollo';
import { Analytics } from '@vercel/analytics/react';
import { installChunkReload } from './lib/chunk-reload';

// Pages are lazy-loaded; recover when a redeploy has replaced the chunk a tab expects
installChunkReload();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <App />
      <Analytics />
    </ApolloProvider>
  </StrictMode>
);