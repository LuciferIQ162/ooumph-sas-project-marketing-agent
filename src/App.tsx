import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import { authService } from './lib/auth';

function App() {
  const isAuthenticated = authService.isAuthenticated();

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/" replace />} />
        <Route 
          path="/" 
          element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Dashboard />} />
          {/* Add other routes here */}
          <Route path="brand-studio" element={<div>Brand Studio - Coming Soon</div>} />
          <Route path="campaigns" element={<div>Campaign Manager - Coming Soon</div>} />
          <Route path="content" element={<div>Content Hub - Coming Soon</div>} />
          <Route path="audience" element={<div>Audience Intelligence - Coming Soon</div>} />
          <Route path="ads" element={<div>Ad Platform - Coming Soon</div>} />
          <Route path="influencers" element={<div>Influencer Network - Coming Soon</div>} />
          <Route path="affiliates" element={<div>Affiliate Portal - Coming Soon</div>} />
          <Route path="analytics" element={<div>Analytics Center - Coming Soon</div>} />
          <Route path="workflows" element={<div>Workflow Orchestrator - Coming Soon</div>} />
          <Route path="settings" element={<div>Settings - Coming Soon</div>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;