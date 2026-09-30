import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (
  typeof window !== "undefined" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
    ? ""
    : "http://localhost:8000");

export const apiUrl = (path: string) => `${API_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

export const apiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return fallback;
};

export const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  paramsSerializer: {
    indexes: null // Axios 1.x+ way to serialize arrays as key=val1&key=val2 instead of key[]=val1
  }
});

export default client;
