export interface Cast {
  created_at: Date;
  updated_at: Date;
  timestamp: Date;

  fid: number;
  hash: Uint8Array;

  parent_fid: number;
  parent_hash: Uint8Array;
  parent_url: string;

  text: string;
  embeds: any;
  mentions: any;
  mentions_positions: any;
}

export interface CastWithReactionCounts extends Cast {
  likes_count: number;
  recasts_count: number;
  replies_count: number;
}
