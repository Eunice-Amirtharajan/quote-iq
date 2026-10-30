import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

interface ScoreReadyPayload {
  quotationId: string;
  score: number;
  label: string;
}

interface LiveScore {
  score: number;
  label: string;
}

// Same server as GraphQL: without VITE_BACKEND_URL, derive it from VITE_API_URL so the two can't
// point at different backends (the old default, port 3000, matched nothing).
export function backendUrl(env: Readonly<Record<string, string | undefined>>): string {
  if (env.VITE_BACKEND_URL) return env.VITE_BACKEND_URL;
  return (env.VITE_API_URL ?? "http://localhost:4000/graphql").replace(/\/graphql\/?$/, "");
}

const BACKEND_URL = backendUrl(import.meta.env);

export function useScoreSocket(quotationId: string): LiveScore | null {
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);

  useEffect(() => {
    const socket: Socket = io(`${BACKEND_URL}/scores`, {
      withCredentials: true,
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket.emit("join", quotationId);
    });

    socket.on("score.ready", (payload: ScoreReadyPayload) => {
      if (payload.quotationId === quotationId) {
        setLiveScore({ score: payload.score, label: payload.label });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [quotationId]);

  return liveScore;
}
