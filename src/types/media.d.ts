export type MediaStreamType = 'video' | 'audio' | 'subtitle' | (string & {});

export interface MediaFormat {
  filename: string;
  format_name: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

export interface MediaStream {
  index: number;
  codec_name: string;
  codec_type: MediaStreamType;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  channels?: number;
  sample_rate?: string;
  pix_fmt?: string;
  start_time?: string;
  tags?: {
    language?: string;
    title?: string;
    [key: string]: string | undefined;
  };
  disposition?: {
    attached_pic?: number;
    [key: string]: number | undefined;
  };
}

export interface FFprobeData {
  format: MediaFormat;
  streams: MediaStream[];
}

export interface SelectedStream {
  streamIndex: number;
  fileIndex?: number;
  type: MediaStreamType;
  codec: string;
  language?: string;
  title?: string;
}

export interface GroupedStreamOption {
  value: SelectedStream;
  label: string;
}

export type GroupedStreamOptions = Record<string, GroupedStreamOption[]>;
