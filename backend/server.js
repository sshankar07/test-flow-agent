const express = require('express');
const cors = require('cors');
const analysisRoutes = require('./routes/analysisRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/agent', analysisRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'TestFlow Agent Backend is running' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`TestFlow Agent Backend running on http://localhost:${PORT}`);
});