import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import projectsRouter from './routes/projects.js';
import periodsRouter from './routes/periods.js';
import metricsRouter from './routes/metrics.js';
import targetsRouter from './routes/targets.js';
import entriesRouter from './routes/entries.js';
import dashboardRouter from './routes/dashboard.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/projects', projectsRouter);
app.use('/api/periods', periodsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/targets', targetsRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/project', dashboardRouter);

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Bekhruz Tracker API running on port ${PORT}`);
});
