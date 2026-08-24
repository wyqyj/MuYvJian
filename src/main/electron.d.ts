declare module 'electron' {
  export class BrowserWindow {
    constructor(options?: any);
    loadURL(url: string): Promise<void>;
    loadFile(filePath: string, options?: any): Promise<void>;
    show(): void;
    hide(): void;
    focus(): void;
    close(): void;
    minimize(): void;
    isVisible(): boolean;
    getBounds(): { x: number; y: number; width: number; height: number };
    destroy(): void;
    isDestroyed(): boolean;
    isMaximized(): boolean;
    maximize(): void;
    unmaximize(): void;
    setBackgroundColor(color: string): void;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    webContents: {
      openDevTools(): void;
      send(channel: string, ...args: any[]): void;
      printToPDF(options: any): Promise<Buffer>;
    };
    static getAllWindows(): BrowserWindow[];
    static getFocusedWindow(): BrowserWindow | null;
  }

  export const app: {
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    quit(): void;
    isPackaged: boolean;
    getPath(name: string): string;
  };

  export interface WebContents {
    send(channel: string, ...args: any[]): void;
  }

  export interface IpcMainInvokeEvent {
    sender: WebContents;
  }

  export const ipcMain: {
    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
    handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
    removeHandler(channel: string): void;
  };

  export const ipcRenderer: {
    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
    send(channel: string, ...args: any[]): void;
    invoke(channel: string, ...args: any[]): Promise<any>;
    removeListener(channel: string, listener: (...args: any[]) => void): void;
  };

  export const globalShortcut: {
    register(accelerator: string, callback: () => void): boolean;
    unregisterAll(): void;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: Record<string, any>): void;
  };

  export const Menu: any;
  export const Tray: any;
  export const nativeImage: {
    createThumbnailFromPath(path: string, size: { width: number; height: number }): Promise<{
      isEmpty(): boolean;
      toPNG(): Buffer;
    }>;
  };
  export const shell: any;
  export const dialog: any;
  export const safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(value: string): Buffer;
    decryptString(value: Buffer): string;
  };
}

declare module 'html-to-docx' {
  const HTMLToDOCX: (html: string, header?: any, options?: any) => Promise<Buffer>;
  export default HTMLToDOCX;
}

declare module 'electron-store' {
  class Store<T = any> {
    constructor(options?: any);
    get(key: string, defaultValue?: any): any;
    set(key: string, value: any): void;
    delete(key: string): void;
    store: T;
  }
  export default Store;
}
