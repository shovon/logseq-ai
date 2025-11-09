type WithStringType = { type: string };
type Unsubscribe = () => void;
type MachineEvent = WithStringType;
type MachineState = WithStringType;
type IdleState = { type: "IDLE" };
type StoppedState = { type: "STOPPED" };
type ActorState<TState extends WithStringType> =
  | IdleState
  | StoppedState
  | TState;

export type Actor<TEvent extends MachineEvent, TState extends MachineState> = {
  /**
   * Sends an event to the actor, which will have it process an event.
   *
   * May or may not update the actor's state immediately, if at all.
   * @param event The event to send to the actor.
   */
  send(event: TEvent): void;

  /**
   * Add an event listener to the event when the internal state of an actor
   * updates.
   * @param listener A callback function to be invoked when the internal state
   *   updates.
   * @param option Additional options for the subscription.
   */
  subscribe(
    listener: (state: TState) => void,
    option?: { immediate?: boolean }
  ): Unsubscribe;

  /**
   * Get a snapshot of the state of the actor.
   */
  getSnapshot(): ActorState<TState>;

  /**
   * Stop the actor entirely; prevent it from processing any more events.
   */
  stop(): void;
};
