import {
  sessionResponse,
  type LoginInput,
  type SessionResponse,
  type SignupInput,
} from '@pramaan/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { queryKeys, sessionQuery } from './queries';

export function useSession() {
  return useQuery(sessionQuery);
}

/** Mutations that end with a fresh session store it directly, so guards react at once. */
function useSessionMutation<TInput>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => api.post(path, input, sessionResponse),
    onSuccess: (session: SessionResponse) => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session, session);
    },
  });
}

export const useSignup = () => useSessionMutation<SignupInput>('/auth/signup');
export const useLogin = () => useSessionMutation<LoginInput>('/auth/login');
export const useSetPassword = () =>
  useSessionMutation<{ token: string; password: string }>('/auth/set-password');

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout', undefined, null),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session, null);
    },
  });
}
