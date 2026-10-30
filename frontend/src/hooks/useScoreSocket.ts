import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { apiBase } from "../lib/api-base";

interface ScoreReadyPayload {
  quotationId: string;
  score: number;
  label: string;
}

interface LiveScore {
  score: number;
  label: string;
}

const BACKEND_URL = apiBase(import.meta.env);

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
