`timescale 1ns/1ps
module tb;
    reg CLK100MHZ = 0, BTNC = 0, BTND = 0;
    wire [6:0] SEG; wire [7:0] AN; wire DP;
    top #(.DEBOUNCE_CYCLES(3)) dut(.*);
    always #5 CLK100MHZ = ~CLK100MHZ;
    task cycles(input integer n); repeat(n) begin @(posedge CLK100MHZ); #1; end endtask
    integer i;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb);
        cycles(3);
        if (SEG !== 7'b1000000 || AN !== 8'hfe || DP !== 1) $fatal(1, "Initial display incorrect");
        BTNC = 1; cycles(1); BTNC = 0; cycles(8);
        if (dut.count !== 0) $fatal(1, "Short bounce incremented counter");
        BTNC = 1; cycles(12);
        if (dut.count !== 1 || SEG !== 7'b1111001) $fatal(1, "Press did not display one");
        cycles(12); if (dut.count !== 1) $fatal(1, "Held button repeated");
        BTNC = 0; cycles(8);
        for (i = 0; i < 9; i = i + 1) begin BTNC = 1; cycles(8); BTNC = 0; cycles(8); end
        if (dut.count !== 0) $fatal(1, "Decimal wrap failed");
        BTNC = 1; cycles(8); BTNC = 0; cycles(8); BTND = 1; cycles(8);
        if (dut.count !== 0 || SEG !== 7'b1000000) $fatal(1, "Reset failed");
        $display("PASS: debounce, hold, decimal wrap, segments, and reset"); $finish;
    end
endmodule
