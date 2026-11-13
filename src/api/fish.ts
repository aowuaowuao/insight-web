import { http } from './http'

export interface Fish {
  id: number
  name: string
  bowls: number
}

/**
 * 业务接口集中管理：组件里只调函数，不写 URL。
 * 好处是接口变了只改这一处。
 */
export const fishApi = {
  list: () => http.get<Fish[]>('/fishes'),
  detail: (id: number) => http.get<Fish>(`/fishes/${id}`),
  create: (payload: Omit<Fish, 'id'>) => http.post<Fish>('/fishes', payload),
  update: (id: number, payload: Partial<Fish>) => http.put<Fish>(`/fishes/${id}`, payload),
  remove: (id: number) => http.delete<void>(`/fishes/${id}`),
}
