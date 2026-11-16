import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
  /** Retry counter incremented to force tree remount. */
  attempt: number;
}

/**
 * Root app error boundary to catch render errors and present recovery UI.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log for adb logcat diagnostics.
    console.warn('[AppErrorBoundary]', error?.message, info?.componentStack);
    this.setState({ componentStack: info?.componentStack ?? null });
  }

  private retry = (): void => {
    // Increment attempt to remount subtree on key change.
    this.setState((previous) => ({ error: null, componentStack: null, attempt: previous.attempt + 1 }));
  };

  render(): ReactNode {
    const { error, componentStack, attempt } = this.state;

    if (!error) {
      return <Fragment key={attempt}>{this.props.children}</Fragment>;
    }

    const details = [error.message, error.stack, componentStack].filter(Boolean).join('\n\n');

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>برنامه با خطا متوقف شد</Text>
          <Text style={styles.body}>
            یک خطای پیش‌بینی‌نشده رخ داد. اطلاعات و تراکنش‌هایت پاک نشده‌اند. با «تلاش
            مجدد» برنامه از نو بارگذاری می‌شود؛ اگر خطا تکرار شد، همین متن پایین را
            برای پشتیبانی بفرست.
          </Text>

          <View style={styles.errorBox}>
            <Text style={styles.errorLabel}>متن خطا (برای گزارش)</Text>
            <Text style={styles.errorText} selectable>
              {details || 'خطای ناشناخته'}
            </Text>
          </View>

          <Pressable
            onPress={this.retry}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="تلاش مجدد و بارگذاری مجدد برنامه">
            <Text style={styles.retryText}>تلاش مجدد (بارگذاری مجدد برنامه)</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emoji: { fontSize: 34 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  body: {
    fontSize: 13,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  errorBox: {
    alignSelf: 'stretch',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  errorLabel: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  errorText: {
    fontSize: 11,
    lineHeight: 18,
    color: '#E2E8F0',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  retryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0EA5E9',
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', writingDirection: 'rtl' },
});
