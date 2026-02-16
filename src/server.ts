const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
const os = require('os');

export class APIServer {
  private app: any;
  private server: any;
  private pool: any;
  private port: number = 3000;
  private logCallback: ((message: string) => void) | null = null;
  private isStopping: boolean = false;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setLogCallback(callback: (message: string) => void) {
    this.logCallback = callback;
  }

  private log(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    if (this.logCallback) {
      this.logCallback(logMessage);
    }
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  private setupRoutes() {
    this.app.get('/api/cells', async (req: any, res: any) => {
      if (this.isStopping || !this.pool) {
        return res.status(503).json({
          success: false,
          error: 'Server is stopping or not connected',
        });
      }

      try {
        const result = await this.pool.request()
          .query('SELECT Number as number, StatusId as status FROM dbo.tb_Cells WHERE StatusId != 0 ORDER BY Number');
        
        res.json({
          success: true,
          data: result.recordset,
        });
      } catch (err) {
        this.log(`Error fetching cells: ${(err as Error).message}`);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch cells',
        });
      }
    });

    this.app.get('/api/stats', async (req: any, res: any) => {
      if (this.isStopping || !this.pool) {
        return res.status(503).json({
          success: false,
          error: 'Server is stopping or not connected',
        });
      }

      try {
        const result = await this.pool.request()
          .query('SELECT Number as number, StatusId as status FROM dbo.tb_Cells WHERE StatusId != 0');
        
        const cells = result.recordset;
        const stats = {
          total: cells.length,
          free: cells.filter((c: any) => c.status === 180).length,
          occupied: cells.filter((c: any) => c.status === 200).length,
          unavailable: cells.filter((c: any) => c.status === 190 || c.status === 210).length,
        };
        
        res.json({
          success: true,
          data: stats,
        });
      } catch (err) {
        this.log(`Error fetching stats: ${(err as Error).message}`);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch stats',
        });
      }
    });

    this.app.get('/api/health', (req: any, res: any) => {
      res.json({
        success: true,
        message: 'API is running',
        timestamp: new Date().toISOString(),
      });
    });
  }

  async start(dbConfig: any): Promise<string> {
    try {
      this.isStopping = false;
      this.log('Connecting to SQL Server...');
      this.pool = await sql.connect(dbConfig);
      this.log('Connected to SQL Server');

      const localIP = this.getLocalIP();

      await new Promise<void>((resolve) => {
        this.server = this.app.listen(this.port, '0.0.0.0', () => {
          this.log(`Server started on port ${this.port}`);
          this.log(`Mobile URL: http://${localIP}:${this.port}`);
          resolve();
        });
      });

      return `http://${localIP}:${this.port}`;
    } catch (err) {
      this.log(`Failed to start server: ${(err as Error).message}`);
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.log('Stopping server...');
    this.isStopping = true;
    
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          this.log('HTTP server closed');
          resolve();
        });
        
        setTimeout(() => {
          this.log('Force closing server...');
          resolve();
        }, 3000);
      });
      
      this.server = null;
    }

    if (this.pool) {
      try {
        await this.pool.close();
        this.log('Database connection closed');
      } catch (err) {
        this.log(`DB close error: ${(err as Error).message}`);
      }
      this.pool = null;
    }

    this.isStopping = false;
    this.log('Server stopped successfully');
  }

  getLocalIP(): string {
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';

    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      if (!interfaces) continue;

      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
    }

    return localIP;
  }
}