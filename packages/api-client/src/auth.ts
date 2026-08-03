import { apiFetch } from "./http";

export interface RequestOtpPayload {
  phone: string; // 10-digit, no country code
}

export interface RequestOtpResponse {
  requestId: string;
  expiresInSeconds: number;
}

export interface VerifyOtpPayload {
  requestId: string;
  phone: string;
  code: string;
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
}

export const authApi = {
  requestOtp: (payload: RequestOtpPayload) =>
    apiFetch<RequestOtpResponse>("/auth/otp/request", { method: "POST", body: payload }),

  verifyOtp: (payload: VerifyOtpPayload) =>
    apiFetch<VerifyOtpResponse>("/auth/otp/verify", { method: "POST", body: payload }),
};
