declare module 'react-native-static-server' {
  export type StaticServerOptions = {
    localOnly?: boolean;
    keepAlive?: boolean;
    [key: string]: unknown;
  };

  export default class StaticServer {
    constructor(port: number, root: string, options?: StaticServerOptions);
    start(): Promise<string>;
    stop(): Promise<void> | void;
    isRunning(): boolean;
  }
}

