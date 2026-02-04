declare module 'react-native-tcp-socket' {
  export type ListenOptions = {
    port: number;
    host?: string;
  };

  export type Socket = {
    on: (event: string, cb: (...args: any[]) => void) => void;
    write: (data: string) => void;
    end: () => void;
    destroy?: () => void;
  };

  export type Server = {
    listen: (options: ListenOptions, cb?: () => void) => void;
    close: (cb?: () => void) => void;
    on: (event: string, cb: (...args: any[]) => void) => void;
  };

  const TcpSocket: {
    createServer: (connectionListener: (socket: Socket) => void) => Server;
  };

  export default TcpSocket;
}

