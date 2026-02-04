declare module 'react-native-keyboard-aware-scroll-view' {
  import * as React from 'react';
  import type { ScrollViewProps } from 'react-native';

  export type KeyboardAwareScrollViewProps = ScrollViewProps & {
    enableOnAndroid?: boolean;
    extraScrollHeight?: number;
    extraHeight?: number;
    keyboardOpeningTime?: number;
  };

  export class KeyboardAwareScrollView extends React.Component<KeyboardAwareScrollViewProps> {}
  export default KeyboardAwareScrollView;
}

