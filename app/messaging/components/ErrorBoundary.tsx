import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class MessagingErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error('[MessagingErrorBoundary] Error caught:', error);
    console.error('[MessagingErrorBoundary] Error info:', errorInfo);

    // Call the optional error handler
    this.props.onError?.(error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReportError = () => {
    const { error, errorInfo } = this.state;
    const errorDetails = `
Error: ${error?.message || 'Unknown error'}
Stack: ${error?.stack || 'No stack trace'}
Component Stack: ${errorInfo?.componentStack || 'No component stack'}
    `.trim();

    Alert.alert(
      'Report Error',
      'Would you like to report this error to help improve the app?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          onPress: () => {
            // In a real app, this would send the error to a logging service
            console.log('[Error Report]', errorDetails);
            Alert.alert('Thank you', 'Error report sent. We appreciate your help!');
          }
        }
      ]
    );
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <View style={styles.container}>
          <View style={styles.errorContent}>
            <Ionicons name="warning" size={48} color="#ff6b6b" style={styles.errorIcon} />
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>
              The messaging feature encountered an error. This might be due to a network issue or a temporary problem.
            </Text>

            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
                <Ionicons name="refresh" size={16} color="#fff" style={styles.retryIcon} />
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.reportButton} onPress={this.handleReportError}>
                <Ionicons name="bug" size={16} color="#666" style={styles.reportIcon} />
                <Text style={styles.reportText}>Report Issue</Text>
              </TouchableOpacity>
            </View>

            {__DEV__ && (
              <View style={styles.debugInfo}>
                <Text style={styles.debugTitle}>Debug Info:</Text>
                <Text style={styles.debugText} numberOfLines={5}>
                  {this.state.error?.message}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// Hook for functional components to use error boundaries
export const useErrorHandler = () => {
  return (error: Error, errorInfo?: ErrorInfo) => {
    console.error('[useErrorHandler] Error:', error);
    if (errorInfo) {
      console.error('[useErrorHandler] Error info:', errorInfo);
    }

    // In a real app, send to error reporting service
    // Example: Sentry.captureException(error, { extra: errorInfo });
  };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E0E',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e50914',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  retryIcon: {
    marginRight: 2,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  reportIcon: {
    marginRight: 2,
  },
  reportText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  debugInfo: {
    marginTop: 20,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff6b6b',
    marginBottom: 4,
  },
  debugText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace',
  },
});

export default MessagingErrorBoundary;
