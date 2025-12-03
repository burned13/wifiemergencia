import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import AndroidIcon from '../../assets/images/android-icon-foreground.png';
import { Colors } from '../theme/colors';

interface StepProgressProps {
  steps: string[];
  currentStep: number;
  doneSteps?: boolean[];
}

export const StepProgress: React.FC<StepProgressProps> = ({ steps, currentStep, doneSteps = [] }) => {
  return (
    <View style={styles.container}>
      {steps.map((label, idx) => {
        const stepIndex = idx + 1;
        const isActive = stepIndex === currentStep;
        const isDone = Boolean(doneSteps[idx]);
        return (
          <View key={`${label}-${idx}`} style={styles.step}>
            <View style={[styles.circle, stepIndex === 3 ? styles.circleLarge : undefined, isDone ? styles.circleDone : isActive ? styles.circleActive : styles.circleIdle]}>
              {stepIndex === 3 ? (
                <Image source={AndroidIcon} style={{ width: 44, height: 44, resizeMode: 'contain' }} />
              ) : (
                <Text style={[styles.circleText, isActive ? styles.circleTextLight : undefined]}>{stepIndex}</Text>
              )}
            </View>
            <Text style={[styles.label, isActive ? styles.labelActive : isDone ? styles.labelDone : undefined]}>{label}</Text>
            <Text style={[styles.doneMark, isDone ? styles.doneMarkDone : styles.doneMarkPending]}>{isDone ? '✓' : '✗'}</Text>
            {idx < steps.length - 1 && (
              <View style={[styles.bar, (isDone && doneSteps[idx + 1]) ? styles.barDone : styles.barIdle]} />
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  circleIdle: {
    backgroundColor: Colors.surface,
  },
  circleLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  circleActive: {
    backgroundColor: Colors.surface,
    borderColor: Colors.primary,
  },
  circleDone: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  circleText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  circleTextLight: {
    color: Colors.primary,
  },
  label: {
    marginLeft: 8,
    marginRight: 12,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  labelActive: {
    color: Colors.primary,
  },
  labelDone: {
    color: Colors.textSecondary,
  },
  bar: {
    width: 24,
    height: 2,
    backgroundColor: Colors.border,
    marginLeft: 6,
    marginRight: 6,
  },
  barIdle: {
    backgroundColor: Colors.border,
  },
  barDone: {
    backgroundColor: Colors.border,
  },
  doneMark: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '800',
  },
  doneMarkDone: {
    color: Colors.primary,
  },
  doneMarkPending: {
    color: Colors.accentRed,
  },
});
