export interface Case {
  id: number;
  receipt_number: string;
  nickname: string | null;
  status: string | null;
  detail: string | null;
  form_num: string | null;
  form_title: string | null;
  is_valid: boolean | null;
  is_finished: boolean;
  archived: boolean;
  last_checked: string | null;
  notify: boolean;
  created_at: string;
}

export interface CaseEvent {
  action_code_text: string;
  action_code_desc: string | null;
  recorded_at: string;
  source: string;
}

export interface CaseCreate {
  receipt_number: string;
  nickname?: string | null;
  notify?: boolean;
}

/** A one-off status lookup for a receipt that is not tracked yet. */
export interface CasePreview {
  receipt_number: string;
  status: string;
  detail: string | null;
  form_num: string | null;
  form_title: string | null;
  is_finished: boolean;
}

export interface CaseUpdate {
  nickname?: string | null;
  notify?: boolean;
  archived?: boolean;
}

export interface Settings {
  apprise_urls: string[];
  poll_interval_hours: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
