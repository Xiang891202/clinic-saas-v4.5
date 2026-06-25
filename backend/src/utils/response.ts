export const success = (data: any, message?: string) => ({
  success: true,
  message,
  data,
});

export const error = (message: string, status = 400) => ({
  success: false,
  error: message,
  status,
});