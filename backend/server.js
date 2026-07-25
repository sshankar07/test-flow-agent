const express = require('express');
const cors = require('cors');
const analysisRoutes = require('./routes/analysisRoutes');
const discoveryRoutes = require('./routes/discoveryRoutes');

const app = express();
const PORT = Number(process.env.PORT || 5001);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/agent', analysisRoutes);
app.use('/discovery', discoveryRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'TestFlow Agent Backend is running' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`TestFlow Agent Backend running on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing backend process or set a different PORT.`);
    process.exit(1);
  }

  console.error('Failed to start backend server:', error.message);
  process.exit(1);
});