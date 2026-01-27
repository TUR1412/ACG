import { NETWORK } from "../../constants";
import { httpFetch } from "../../utils/http";

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  return httpFetch(url, undefined, {
    label: "fulltext",
    timeoutMs,
    retries: 0,
    headers: {
      accept: NETWORK.TEXT_ACCEPT
    }
  });
}
