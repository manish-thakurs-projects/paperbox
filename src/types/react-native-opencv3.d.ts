declare module "react-native-opencv3" {
  import { ComponentClass, ReactNode } from "react";
  import { ViewProps } from "react-native";

  export interface CvCameraProps extends ViewProps {
    facing?: "back" | "front";
    useStorage?: boolean;
    onPayload?: (event: { payload: any }) => void;
    onFrameSize?: (event: {
      payload: { frameSize: { frameWidth: number; frameHeight: number } };
    }) => void;
  }

  export const CvCamera: ComponentClass<CvCameraProps>;
  export const CvInvoke: ComponentType<{
    inobj?: string;
    func: string;
    params?: any;
    outobj?: string;
    callback?: string;
    children?: ReactNode;
  }>;
  export const CvInvokeGroup: ComponentType<{
    groupid: string;
    children?: ReactNode;
  }>;
  export const RNCv: any;
  export const ColorConv: any;
  export const Imgproc: any;
  export const Core: any;
  export class CvSize {
    constructor(width: number, height: number);
  }
  export class CvScalar {
    constructor(a: number, b: number, c: number, d?: number);
  }
}
