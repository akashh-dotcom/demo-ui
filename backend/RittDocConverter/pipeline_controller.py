"""
Pipeline Controller - Step Logging

Logs completion of each pipeline step and continues automatically.

Usage:
    from pipeline_controller import PipelineController

    controller = PipelineController()

    # After each step in the pipeline:
    controller.prompt_continue("Step Name")
    # ... do the work ...
"""

import sys


class PipelineController:
    """
    Controller that logs completion of each pipeline step.

    Automatically logs step completion and continues to the next step.
    """

    def __init__(self):
        self.step_count = 0

    def prompt_continue(self, step_name):
        """
        Log step completion and continue automatically.

        Args:
            step_name: Name of the step that was just completed
        """
        self.step_count += 1

        print(f"\n{'='*60}")
        print(f"✓ Step completed: {step_name}")
        print(f"{'='*60}")
        print("▶️  Continuing...\n")

    def stop(self):
        """Gracefully stop the controller (no-op in this simple version)"""
        pass


# Convenience function for quick setup
def create_controller():
    """
    Create a new pipeline controller.

    Returns:
        PipelineController: A controller instance
    """
    return PipelineController()


if __name__ == "__main__":
    # Test the controller
    print("Testing Pipeline Controller...")
    print("This will simulate a pipeline with multiple steps.\n")

    controller = create_controller()

    steps = [
        "Reading Order Extraction",
        "Font Role Detection",
        "Media Extraction",
        "Flow Building",
        "Validation",
        "Packaging"
    ]

    for step in steps:
        print(f"Processing: {step}...")
        # Simulate work
        import time
        time.sleep(0.5)

        # Prompt after each step
        controller.prompt_continue(step)

    print("\n✓ All steps completed!")
    controller.stop()
