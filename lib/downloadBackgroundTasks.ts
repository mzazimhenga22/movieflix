import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { tickDownloadQueue } from './downloadManager';

const TASK_NAME = 'movieflix-download-queue-tick';

// Define at module scope (required by expo-task-manager)
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const hasWork = await tickDownloadQueue();
    return hasWork ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerDownloadBackgroundTasks() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    const available =
      status === BackgroundFetch.BackgroundFetchStatus.Available ||
      status === BackgroundFetch.BackgroundFetchStatus.Restricted;

    if (!available) return;

    const already = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (already) return;

    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: 15 * 60, // iOS min is system-controlled; Android may run more often.
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // ignore
  }
}
