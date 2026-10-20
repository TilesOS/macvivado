`timescale 1ns/1ps
module tb;
    reg CLK100MHZ = 0;
    wire LED;
    top #(.HALF_PERIOD(4)) dut(.CLK100MHZ(CLK100MHZ), .LED(LED));
    always #5 CLK100MHZ = ~CLK100MHZ;
    integer i;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb);
        for (i = 1; i <= 16; i = i + 1) begin
            @(posedge CLK100MHZ); #1;
            if (LED !== ((i / 4) % 2)) $fatal(1, "Blink period mismatch at cycle %0d", i);
        end
        $display("PASS: blink toggles exactly every four cycles"); $finish;
    end
endmodule
