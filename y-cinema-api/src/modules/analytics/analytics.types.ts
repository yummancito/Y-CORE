export type AnalyticsEventType = 'search' | 'view' | 'favorite'

export interface RecordEventInput {
  type: AnalyticsEventType
  /** término buscado (type=search) o mediaId (type=view/favorite) */
  subject: string
  userId?: string
}
